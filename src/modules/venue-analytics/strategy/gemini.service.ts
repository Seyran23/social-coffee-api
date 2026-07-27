import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { LoggerService } from '@/common/logger/logger.service';

import { GeminiError } from './errors/gemini.error';

@Injectable()
export class GeminiService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(GeminiService.name);
  }

  isConfigured(): boolean {
    return !!this.config.get<string>('GEMINI_API_KEY');
  }

  async generate(system: string, userPayload: string): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    const model = this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    let response;
    try {
      response = await axios.post(
        url,
        {
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: userPayload }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
        },
        {
          params: { key: apiKey },
          headers: { 'Content-Type': 'application/json' },
          timeout: 20_000,
        },
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const detail =
          (err.response?.data as { error?: { message?: string } })?.error
            ?.message ?? err.message;
        throw new GeminiError(
          `Gemini request failed (${status ?? 'network'}): ${detail}`,
          status,
        );
      }
      throw err;
    }

    const text: string =
      response.data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('') ?? '';

    if (!text.trim()) {
      throw new Error('Gemini returned an empty response');
    }
    return text.trim();
  }
}
