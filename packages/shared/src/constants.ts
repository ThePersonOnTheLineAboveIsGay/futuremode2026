/**
 * Constants shared across services.
 */

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // base32, no ambiguous chars

export const MAX_PARTICIPANTS_MVP = 10;

export const DEFAULT_PERSONAS = {
  critic: {
    id: 'critic' as const,
    displayName: '嚴謹評審',
    description: '直接、講求證據、會指出邏輯矛盾、過度承諾與可行性問題',
    threshold: 0.6,
    cooldownMs: 10_000,
    voice: 'onyx',
  },
  coach: {
    id: 'coach' as const,
    displayName: '教練',
    description: '鼓勵、蘇格拉底式提問、引導思考而非直接給答案',
    threshold: 0.65,
    cooldownMs: 15_000,
    voice: 'nova',
  },
  consultant: {
    id: 'consultant' as const,
    displayName: '顧問',
    description: '冷靜、提供選項、幫助釐清利弊而非選邊站',
    threshold: 0.6,
    cooldownMs: 12_000,
    voice: 'echo',
  },
};

export const DEFAULT_SCENARIOS = {
  general: {
    id: 'general' as const,
    displayName: '通用會議',
    systemPromptAddition: '',
  },
  engineering: {
    id: 'engineering' as const,
    displayName: '軟體工程',
    systemPromptAddition: '專注於技術可行性、架構取捨、與時程/資源估算。',
  },
  business: {
    id: 'business' as const,
    displayName: '商業決策',
    systemPromptAddition: '專注於商業邏輯、利害關係人影響、與 ROI 評估。',
  },
  brainstorm: {
    id: 'brainstorm' as const,
    displayName: '腦力激盪',
    systemPromptAddition: '鼓勵發散思考，避免過早批評；只在明顯離題時介入。',
  },
};

export const AI_BOT_IDENTITY_PREFIX = 'ai-bot';
export const DEFAULT_LANGUAGE = 'zh-TW';
