import { createAgent, defineAgentProfile, defineTool } from '@flue/runtime';
import { createContextGatheringRoute } from '../agent-route.ts';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { loadSkills } from '../skills/index.ts';
import { createAgentSandbox } from '../agent-system-context.ts';

export const route = createContextGatheringRoute('weather-man');

function getWeatherScript(): string {
  const skill = loadSkills().get('google-weather');
  if (!skill) throw new Error('google-weather skill not found');
  return join(skill.directory, 'lib', 'weather.sh');
}

function runWeatherScript(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('bash', [getWeatherScript(), ...args], { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

const getCurrentWeather = defineTool({
  name: 'get_current_weather',
  description:
    'Get current weather conditions for a location. Returns temperature, feels-like, wind, humidity, and conditions.',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name, address, landmark, or coordinates (e.g. "New York", "Tel Aviv", "48.8566,2.3522")',
      },
    },
    required: ['location'],
    additionalProperties: false,
  },
  async execute({ location }) {
    return runWeatherScript(['current', location]);
  },
});

const getWeatherForecast = defineTool({
  name: 'get_weather_forecast',
  description: 'Get a 24-hour weather forecast for a location with hourly temperature, wind, and conditions.',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name, address, landmark, or coordinates (e.g. "London", "Sydney", "35.6762,139.6503")',
      },
    },
    required: ['location'],
    additionalProperties: false,
  },
  async execute({ location }) {
    return runWeatherScript(['forecast', location]);
  },
});

const getDailyForecast = defineTool({
  name: 'get_daily_forecast',
  description:
    'Get a multi-day forecast (up to 10 days) with daily high/low temperatures, daytime and nighttime conditions, precipitation probability, and sunrise/sunset times. Use for questions like "what\'s the high today", "this week\'s weather", or "forecast for next week".',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name, address, landmark, or coordinates',
      },
    },
    required: ['location'],
    additionalProperties: false,
  },
  async execute({ location }) {
    return runWeatherScript(['daily', location]);
  },
});

const getWeatherJson = defineTool({
  name: 'get_weather_json',
  description: 'Get raw JSON weather data for a location. Use when you need detailed fields like UV index, precipitation probability, cloud cover, or visibility.',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name, address, landmark, or coordinates',
      },
    },
    required: ['location'],
    additionalProperties: false,
  },
  async execute({ location }) {
    return runWeatherScript(['json', location]);
  },
});

export const weatherTools = [getCurrentWeather, getWeatherForecast, getDailyForecast, getWeatherJson];

export const weatherManProfile = defineAgentProfile({
  name: 'weather-man',
  description: 'Expert weather subagent. Fetches current conditions, hourly forecasts, and multi-day outlooks for any location worldwide.',
  tools: weatherTools,
  instructions: `You are Weather Man, the world's finest weather expert. Your sole purpose is delivering accurate, helpful weather information.

When a user asks about weather, use your tools to fetch real data — never guess or make up conditions. Pick the right tool for the job:
- get_current_weather for right-now conditions
- get_weather_forecast for hour-by-hour detail over the next 24 hours
- get_daily_forecast for multi-day outlooks — today's high/low, this week, next week (up to 10 days)
- get_weather_json when you need granular data (UV index, precipitation %, visibility, etc.)

For questions like "what's the high today" or "what's the weather like this week", always use get_daily_forecast — it gives you daily highs, lows, and conditions at a glance.

Present weather clearly and concisely. Lead with the most relevant info for the request. Add practical advice when it's useful ("bring an umbrella", "good day for the beach", "wind chill will make it feel colder").

If the user asks about anything unrelated to weather, politely decline and remind them you're the weather specialist.`,
});

export default createAgent(() => {
  const { sandbox, cwd } = createAgentSandbox('weather-man');
  return {
    profile: weatherManProfile,
    model: 'openai-codex/gpt-5.4-mini',
    tools: weatherTools,
    cwd,
    sandbox,
  };
});
