#!/usr/bin/env python3
"""
Google Weather API integration.
Uses the same API key as Google Maps (GOOGLE_API_KEY).
"""
import requests
import sys
import json
import os
from datetime import datetime
import google.auth
import google.auth.transport.requests

class GoogleWeather:

    def __init__(self):
        self.api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_WEATHER_API_KEY") or os.getenv("GOOGLE_MAPS_API_KEY")
        self.current_url = "https://weather.googleapis.com/v1/currentConditions:lookup"
        self.forecast_url = "https://weather.googleapis.com/v1/forecast/hours:lookup"
        self.daily_forecast_url = "https://weather.googleapis.com/v1/forecast/days:lookup"
        self.geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
        self._token = None
        if not self.api_key and os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            self._refresh_token()

    def _refresh_token(self):
        try:
            credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
            credentials.refresh(google.auth.transport.requests.Request())
            self._token = credentials.token
        except Exception as e:
            self._token = None

    def _auth_params(self):
        if self.api_key:
            return {"key": self.api_key}, {}
        headers = {"Authorization": f"Bearer {self._token}"}
        project = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_QUOTA_PROJECT")
        if project:
            headers["x-goog-user-project"] = project
        return {}, headers

    def _validate_key(self):
        if not self.api_key and not self._token:
            return {"error": "Missing credentials. Set GOOGLE_API_KEY or GOOGLE_APPLICATION_CREDENTIALS."}
        return None
    
    def geocode(self, location):
        """Convert location name to lat/lon."""
        if self.api_key:
            # Use Google Geocoding API
            params = {"address": location, "key": self.api_key}
            try:
                res = requests.get(self.geocode_url, params=params).json()
                if res.get("results"):
                    loc = res["results"][0]["geometry"]["location"]
                    return (loc["lat"], loc["lng"])
            except Exception:
                pass
        else:
            # Fall back to OpenStreetMap Nominatim
            try:
                res = requests.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": location, "format": "json", "limit": 1},
                    headers={"User-Agent": "google-weather-skill/1.0"}
                ).json()
                if res:
                    return (float(res[0]["lat"]), float(res[0]["lon"]))
            except Exception:
                pass
        return None
    
    def current(self, location, language="en", units="IMPERIAL"):
        """Get current weather conditions."""
        error = self._validate_key()
        if error:
            return error

        # Get coordinates
        coords = self.geocode(location) if isinstance(location, str) else location
        if not coords:
            return {"error": f"Could not find location: {location}"}
        lat, lon = coords

        # Call Weather API
        key_params, headers = self._auth_params()
        params = {
            **key_params,
            "location.latitude": lat,
            "location.longitude": lon,
            "languageCode": language,
        }

        try:
            res = requests.get(self.current_url, params=params, headers=headers)
            if res.status_code != 200:
                return {"error": f"API error: {res.status_code}", "details": res.text}
            data = res.json()
        except Exception as e:
            return {"error": f"Request failed: {str(e)}"}

        imperial = units == "IMPERIAL"

        def to_f(c):
            return round(c * 9/5 + 32, 1) if c is not None else None

        def to_mph(kmh):
            return round(kmh * 0.621371, 1) if kmh is not None else None

        # Format response
        result = {
            "location": location if isinstance(location, str) else f"{lat},{lon}",
            "time": data.get("currentTime", ""),
            "timezone": data.get("timeZone", {}).get("id", ""),
            "is_daytime": data.get("isDaytime", True),
        }
        
        # Weather condition
        condition = data.get("weatherCondition", {})
        result["condition"] = {
            "type": condition.get("type", "UNKNOWN"),
            "text": condition.get("description", {}).get("text", ""),
            "icon": condition.get("iconBaseUri", "")
        }
        
        # Temperature
        temp = data.get("temperature", {})
        feels_like = data.get("feelsLikeTemperature", {})
        t_cur = temp.get("degrees")
        t_feel = feels_like.get("degrees")
        result["temperature"] = {
            "current": to_f(t_cur) if imperial else t_cur,
            "feels_like": to_f(t_feel) if imperial else t_feel,
            "unit": "FAHRENHEIT" if imperial else "CELSIUS"
        }

        # Other conditions
        result["humidity"] = data.get("relativeHumidity")
        result["uv_index"] = data.get("uvIndex")
        result["cloud_cover"] = data.get("cloudCover")

        # Wind
        wind = data.get("wind", {})
        spd = wind.get("speed", {}).get("value")
        gust = wind.get("gust", {}).get("value")
        result["wind"] = {
            "speed": to_mph(spd) if imperial else spd,
            "unit": "MILES_PER_HOUR" if imperial else "KILOMETERS_PER_HOUR",
            "direction": wind.get("direction", {}).get("cardinal", ""),
            "gust": to_mph(gust) if imperial else gust
        }
        
        # Precipitation
        precip = data.get("precipitation", {})
        result["precipitation"] = {
            "probability": precip.get("probability", {}).get("percent", 0),
            "type": precip.get("probability", {}).get("type", "RAIN")
        }
        
        return result

    def forecast(self, location, hours=24, language="en", units="IMPERIAL"):
        """Get hourly forecast."""
        error = self._validate_key()
        if error:
            return error

        # Get coordinates
        coords = self.geocode(location) if isinstance(location, str) else location
        if not coords:
            return {"error": f"Could not find location: {location}"}
        lat, lon = coords

        # Call Forecast API
        key_params, headers = self._auth_params()
        params = {
            **key_params,
            "location.latitude": lat,
            "location.longitude": lon,
            "hours": hours,
            "languageCode": language,
        }

        try:
            res = requests.get(self.forecast_url, params=params, headers=headers)
            if res.status_code != 200:
                return {"error": f"API error: {res.status_code}", "details": res.text}
            data = res.json()
        except Exception as e:
            return {"error": f"Request failed: {str(e)}"}

        imperial = units == "IMPERIAL"

        def to_f(c):
            return round(c * 9/5 + 32, 1) if c is not None else None

        def to_mph(kmh):
            return round(kmh * 0.621371, 1) if kmh is not None else None

        # Process hours
        hourly = []
        for h in data.get("forecastHours", []):
            t = h.get("temperature", {}).get("degrees")
            spd = h.get("wind", {}).get("speed", {}).get("value")
            gust = h.get("wind", {}).get("gust", {}).get("value")
            entry = {
                "time": h.get("interval", {}).get("startTime"),
                "display_time": h.get("displayDateTime"),
                "temp": to_f(t) if imperial else t,
                "condition": {
                    "text": h.get("weatherCondition", {}).get("description", {}).get("text"),
                },
                "wind": {
                    "speed": to_mph(spd) if imperial else spd,
                    "direction": h.get("wind", {}).get("direction", {}).get("cardinal"),
                    "gust": to_mph(gust) if imperial else gust
                },
                "precip_prob": h.get("precipitation", {}).get("probability", {}).get("percent")
            }
            hourly.append(entry)
            
        return {
            "location": location,
            "hourly": hourly,
            "temp_unit": "°F" if imperial else "°C",
            "wind_unit": "mph" if imperial else "km/h"
        }

    def daily_forecast(self, location, days=10, language="en", units="IMPERIAL"):
        """Get daily forecast with high/low temperatures."""
        error = self._validate_key()
        if error:
            return error

        coords = self.geocode(location) if isinstance(location, str) else location
        if not coords:
            return {"error": f"Could not find location: {location}"}
        lat, lon = coords

        key_params, headers = self._auth_params()
        params = {
            **key_params,
            "location.latitude": lat,
            "location.longitude": lon,
            "days": days,
            "languageCode": language,
        }

        try:
            res = requests.get(self.daily_forecast_url, params=params, headers=headers)
            if res.status_code != 200:
                return {"error": f"API error: {res.status_code}", "details": res.text}
            data = res.json()
        except Exception as e:
            return {"error": f"Request failed: {str(e)}"}

        imperial = units == "IMPERIAL"

        def to_f(c):
            return round(c * 9/5 + 32, 1) if c is not None else None

        def to_mph(kmh):
            return round(kmh * 0.621371, 1) if kmh is not None else None

        daily = []
        for d in data.get("forecastDays", []):
            interval = d.get("interval", {})
            daytime = d.get("daytimeForecast", {})
            nighttime = d.get("nighttimeForecast", {})
            temp_range = d.get("temperature", {})
            high = temp_range.get("max", {}).get("degrees")
            low = temp_range.get("min", {}).get("degrees")
            wind = d.get("maxWind", {})
            spd = wind.get("speed", {}).get("value")

            entry = {
                "date": interval.get("startTime", "")[:10],
                "high": to_f(high) if imperial else high,
                "low": to_f(low) if imperial else low,
                "daytime_condition": daytime.get("weatherCondition", {}).get("description", {}).get("text", ""),
                "nighttime_condition": nighttime.get("weatherCondition", {}).get("description", {}).get("text", ""),
                "max_wind": {
                    "speed": to_mph(spd) if imperial else spd,
                    "direction": wind.get("direction", {}).get("cardinal", ""),
                },
                "precip_prob": d.get("precipitation", {}).get("probability", {}).get("percent", 0),
                "sunrise": d.get("sunrise", ""),
                "sunset": d.get("sunset", ""),
            }
            daily.append(entry)

        return {
            "location": location,
            "daily": daily,
            "temp_unit": "°F" if imperial else "°C",
            "wind_unit": "mph" if imperial else "km/h",
        }

    def format_summary(self, data):
        """Format weather data as human-readable summary."""
        if "error" in data:
            return f"Error: {data['error']}"

        if "daily" in data:
            return self.format_daily(data)

        if "hourly" in data:
            return self.format_forecast(data)

        temp = data.get("temperature", {})
        condition = data.get("condition", {})
        wind = data.get("wind", {})
        temp_unit = "°F" if temp.get("unit", "FAHRENHEIT") == "FAHRENHEIT" else "°C"
        wind_unit = "mph" if wind.get("unit", "MILES_PER_HOUR") == "MILES_PER_HOUR" else "km/h"
        desc = condition.get('text', '') or condition.get('type', '')
        lines = [
            f"*{data.get('location', 'Unknown')}*",
            desc,
            f"🌡️ {temp.get('current', '?')}{temp_unit} (feels like {temp.get('feels_like', '?')}{temp_unit})",
            f"💨 Wind: {wind.get('speed', '?')} {wind_unit} {wind.get('direction', '')}",
            f"💧 Humidity: {data.get('humidity', '?')}%",
        ]
        return "\n".join(lines)

    def format_forecast(self, data):
        """Format forecast data."""
        temp_unit = data.get("temp_unit", "°F")
        wind_unit = data.get("wind_unit", "mph")
        lines = [f"*24h Forecast for {data['location']}*"]
        for i, h in enumerate(data['hourly']):
            if i % 4 == 0:
                time_str = f"{h['display_time']['hours']:02d}:00"
                lines.append(f"{time_str}: {h['temp']}{temp_unit}, {h['condition']['text']} {h['wind']['speed']} {wind_unit} {h['wind']['direction']}")
        return "\n".join(lines)


    def format_daily(self, data):
        """Format daily forecast data."""
        temp_unit = data.get("temp_unit", "°F")
        lines = [f"*Forecast for {data['location']}*"]
        for d in data["daily"]:
            date_str = d["date"]
            try:
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                date_str = dt.strftime("%a %b %d")
            except ValueError:
                pass
            lines.append(
                f"{date_str}: ↑{d['high']}{temp_unit} ↓{d['low']}{temp_unit} — "
                f"{d['daytime_condition']}"
                f"{f', {d["precip_prob"]}% precip' if d.get('precip_prob') else ''}"
            )
        return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print("Usage: weather_helper.py <command> [args]")
        print("Commands:")
        print("  current <location>  - Get current weather")
        print("  forecast <location> - Get 24h hourly forecast")
        print("  daily <location>    - Get 10-day daily forecast (high/low)")
        print("  json <location>     - Get raw JSON data")
        sys.exit(1)
    
    weather = GoogleWeather()
    command = sys.argv[1].lower()
    location = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else "New York, NY"

    if command == "current":
        data = weather.current(location)
        print(weather.format_summary(data))
    elif command == "forecast":
        data = weather.forecast(location)
        print(weather.format_summary(data))
    elif command == "daily":
        data = weather.daily_forecast(location)
        print(weather.format_summary(data))
    elif command == "json":
        data = weather.current(location)
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main()
