import { ISmsProvider, MockSmsProvider } from './sms.provider';
import { IWhatsAppProvider, MockWhatsAppProvider } from './whatsapp.provider';
import { config } from '../config';

export class ProviderFactory {
  public static getSmsProvider(): ISmsProvider {
    switch (config.SMS_PROVIDER.toUpperCase()) {
      case 'TWILIO':
      case 'GUPSHUP':
      case 'AWS_SNS':
        // Pluggable hook for future providers
        return new MockSmsProvider();
      case 'SIMULATED':
      default:
        return new MockSmsProvider();
    }
  }

  public static getWhatsAppProvider(): IWhatsAppProvider {
    switch (config.WHATSAPP_PROVIDER.toUpperCase()) {
      case 'TWILIO':
      case 'GUPSHUP':
      case 'SIMULATED':
      default:
        return new MockWhatsAppProvider();
    }
  }
}
