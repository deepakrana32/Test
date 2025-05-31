export class LocalizationManager {
  private locale: string;
  private timezone: string;
  private formatters: Map<string, Intl.DateTimeFormat>;

  constructor(locale: string = 'en-IN', timezone: string = 'Asia/Kolkata') {
    this.locale = locale;
    this.timezone = timezone;
    this.formatters = new Map();
    this.setupFormatters();
  }

  private setupFormatters() {
    this.formatters.set('time', new Intl.DateTimeFormat(this.locale, {
      timeZone: this.timezone,
      hour12: false,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }));
    this.formatters.set('price', new Intl.NumberFormat(this.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }));
  }

  formatTime(time: number): string {
    return this.formatters.get('time')!.format(new Date(time)) + ', IST';
  }

  formatPrice(price: number): string {
    return this.formatters.get('price')!.format(price);
  }

  setLocale(locale: string, timezone: string = this.timezone) {
    this.locale = locale;
    this.timezone = timezone;
    this.setupFormatters();
  }

  getLocale(): string {
    return this.locale;
  }

  getTimezone(): string {
    return this.timezone;
  }

  destroy() {
    this.formatters.clear();
  }
}
