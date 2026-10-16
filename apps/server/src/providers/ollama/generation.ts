export const OLLAMA_GENERATION_VERSION='ollama-generation-v1';
export const OLLAMA_TIMEOUT_MS=300_000;
export interface GenerationSettings {
  temperature?:number|undefined;
  seed?:number|undefined;
  numCtx?:number|undefined;
  numPredict?:number|undefined;
}

// Shared by production inference and the opt-in benchmark commands.
export function generationOptions(settings:GenerationSettings={}) {
  const temperature=settings.temperature??0.1,num_ctx=settings.numCtx??8192,num_predict=settings.numPredict??2048;
  if(!Number.isFinite(temperature)||temperature<0||temperature>2||!Number.isInteger(num_ctx)||num_ctx<512||num_ctx>262144||!Number.isInteger(num_predict)||num_predict<1||num_predict>num_ctx||settings.seed!==undefined&&!Number.isSafeInteger(settings.seed))throw new Error('Invalid Ollama generation configuration.');
  return {temperature,num_ctx,num_predict,...(settings.seed!==undefined?{seed:settings.seed}:{})};
}
