import {describe,it,expect} from 'vitest';
import {OllamaService,OllamaError} from './service.js';

describe('OllamaService', () => {
  const dummyDatabase = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    }),
  } as any;

  it('reports healthy when Ollama responds', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ models: [] }), { status: 200 });
    const service = new OllamaService({ database: dummyDatabase, baseUrl: 'http://127.0.0.1:11434', fetcher });
    const health = await service.healthCheck();
    expect(health.status).toBe('connected');
    expect(health.errorCode).toBeNull();
  });

  it('reports unavailable when fetch fails', async () => {
    const fetcher: typeof fetch = async () => { throw new Error('ECONNREFUSED'); };
    const service = new OllamaService({ database: dummyDatabase, baseUrl: 'http://127.0.0.1:11434', fetcher });
    const health = await service.healthCheck();
    expect(health.status).toBe('unavailable');
    expect(health.errorCode).toBe('OLLAMA_UNAVAILABLE');
  });

  it('lists models correctly', async () => {
    const mockModels = {
      models: [
        {
          name: 'qwen2.5-coder:7b',
          size: 4683087561,
          modified_at: '2026-10-12T23:32:14Z',
          details: {
            format: 'gguf',
            family: 'qwen2',
            parameter_size: '7.6B',
            quantization_level: 'Q4_K_M',
          },
        },
      ],
    };
    const fetcher: typeof fetch = async () => new Response(JSON.stringify(mockModels), { status: 200 });
    const service = new OllamaService({ database: dummyDatabase, baseUrl: 'http://127.0.0.1:11434', fetcher });
    const models = await service.listModels();
    expect(models).toHaveLength(1);
    expect(models[0]?.name).toBe('qwen2.5-coder:7b');
    expect(models[0]?.details?.parameterSize).toBe('7.6B');
  });

  it('generates structured JSON output', async () => {
    let capturedBody: any = null;
    const fetcher: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({
        model: 'qwen2.5-coder:7b',
        message: { content: '{"status":"ok","findingCount":3}' },
        prompt_eval_count: 50,
        eval_count: 25,
      }), { status: 200 });
    };

    const service = new OllamaService({ database: dummyDatabase, baseUrl: 'http://127.0.0.1:11434', fetcher });
    const result = await service.generate('qwen2.5-coder:7b', 'System instruction', 'User input');

    expect(capturedBody.model).toBe('qwen2.5-coder:7b');
    expect(capturedBody.format).toBe('json');
    expect(capturedBody.stream).toBe(false);
    expect(result.output).toEqual({ status: 'ok', findingCount: 3 });
    expect(result.usage?.total_tokens).toBe(75);
  });

  it('throws INVALID_MODEL_OUTPUT if model output is not valid JSON', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      model: 'qwen2.5-coder:7b',
      message: { content: 'Not a JSON text' },
    }), { status: 200 });

    const service = new OllamaService({ database: dummyDatabase, baseUrl: 'http://127.0.0.1:11434', fetcher });
    await expect(service.generate('qwen2.5-coder:7b', 'Inst', 'Input')).rejects.toThrow(OllamaError);
  });

  it('validates model identifier characters', async () => {
    const service = new OllamaService({ database: dummyDatabase, baseUrl: 'http://127.0.0.1:11434' });
    await expect(service.generate('model with spaces!', 'Inst', 'Input')).rejects.toThrow(OllamaError);
  });
  it('rejects oversized provider responses',async()=>{
    const service=new OllamaService({database:dummyDatabase,fetcher:async()=>new Response('x'.repeat(2_000_001))});
    await expect(service.generate('model:7b','instructions','{}')).rejects.toMatchObject({code:'RESPONSE_TOO_LARGE'});
  });

});
