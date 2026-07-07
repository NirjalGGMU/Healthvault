declare module 'svg-captcha' {
  interface CaptchaOptions {
    size?: number;
    noise?: number;
    color?: boolean;
    background?: string;
    width?: number;
    height?: number;
    fontSize?: number;
    charPreset?: string;
    ignoreChars?: string;
  }

  interface CaptchaResult {
    text: string;
    data: string;
  }

  export function create(options?: CaptchaOptions): CaptchaResult;
}
