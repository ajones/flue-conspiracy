import { trace, SpanStatusCode } from '@opentelemetry/api';
import { sendImessageText } from './channels/imessage.ts';
import { sendTelegramText } from './channels/telegram.ts';
import { createLogger } from './log.ts';

const log = createLogger('deliver');
const tracer = trace.getTracer('raven');

export async function sendToConversation(target: string, text: string): Promise<void> {
  if (target.startsWith('imessage:chat:')) {
    await tracer.startActiveSpan('deliver.imessage', {
      attributes: {
        'raven.deliver.channel': 'imessage',
        'raven.deliver.target': target,
        'raven.deliver.text_length': text.length,
      },
    }, async (span) => {
      try {
        await sendImessageText(target, text);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    });
    return;
  }
  if (target.startsWith('telegram:')) {
    await tracer.startActiveSpan('deliver.telegram', {
      attributes: {
        'raven.deliver.channel': 'telegram',
        'raven.deliver.target': target,
        'raven.deliver.text_length': text.length,
      },
    }, async (span) => {
      try {
        await sendTelegramText(target, text);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    });
    return;
  }

  log.warn('No delivery channel for target', { target });
  throw new Error(`No delivery channel registered for conversation key: ${target}`);
}
