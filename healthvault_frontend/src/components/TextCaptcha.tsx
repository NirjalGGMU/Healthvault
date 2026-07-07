import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import api from '../api/axios';
import { useLanguage } from '../context/LanguageContext';

export interface TextCaptchaHandle {
  refresh: () => void;
}

interface TextCaptchaProps {
  value: string;
  onValueChange: (value: string) => void;
  onTokenChange: (token: string | null) => void;
}

const TextCaptcha = forwardRef<TextCaptchaHandle, TextCaptchaProps>(
  ({ value, onValueChange, onTokenChange }, ref) => {
    const { t } = useLanguage();
    const [svg, setSvg] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchCaptcha = async () => {
      setLoading(true);
      onValueChange('');
      try {
        const { data } = await api.get<{ svg: string; captchaToken: string }>('/auth/captcha');
        setSvg(data.svg);
        onTokenChange(data.captchaToken);
      } catch {
        onTokenChange(null);
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      void fetchCaptcha();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({ refresh: fetchCaptcha }));

    return (
      <div>
        <label htmlFor="captcha-answer" className="label">
          {t('captcha.label')}
        </label>
        <div className="flex items-center gap-2">
          <div
            className="flex h-[60px] w-[160px] items-center justify-center overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <button
            type="button"
            onClick={() => void fetchCaptcha()}
            disabled={loading}
            aria-label={t('captcha.refresh')}
            className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            ↻
          </button>
        </div>
        <input
          id="captcha-answer"
          type="text"
          className="input-field mt-2"
          placeholder={t('captcha.placeholder')}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
    );
  }
);

TextCaptcha.displayName = 'TextCaptcha';

export default TextCaptcha;
