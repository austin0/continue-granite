import { BaseLLM } from "../index.js";
import { ChatMessage, CompletionOptions, LLMOptions, ModelProvider, RequestOptions } from "../../index.js";
import { streamSse } from "../stream.js";

class IBM extends BaseLLM {
	private conversationId?: string;
	private parentId?: string;
	static providerName: ModelProvider = "ibm";

	static defaultOptions: Partial<LLMOptions> = {
		apiBase: "https://bam-api.res.ibm.com/v2/text",
		apiVersion: new Date().toISOString().split("T")[0],
	};

	private static MODEL_IDS: { [name: string]: string } = {
		"granite-3b-code-instruct": "ibm/granite-3b-code-instruct",
		"granite-8b-code-instruct": "ibm/granite-8b-code-instruct",
		"granite-34b-code-instruct": "ibm/granite-34b-code-instruct",
	};

	private _getModelName(model: string) {
		return IBM.MODEL_IDS[model] || this.model;
	}

	private _convertArgs(options: CompletionOptions) {
		const finalOptions = {
			model_id: this._getModelName(this.model),
			conversationId: this.conversationId,
			parentId: this.parentId,
			parameters: {
				temperature: options.temperature,
				min_new_tokens: 1,
				max_new_tokens: options.maxTokens,
				stop_sequences: options.stop,
				decoding_method: "greedy",
			},
		};

		return finalOptions;
	}

	protected async *_streamChat(
		messages: ChatMessage[],
		options: CompletionOptions,
	): AsyncGenerator<ChatMessage> {
		let endpoint = options.stream !== false ? "chat_stream" : "chat"
		console.log(endpoint)

		const response = await this.fetch(new URL(`${this.apiBase}${endpoint}?version=${this.apiVersion}`), {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				...this._convertArgs(options),
				messages: (messages),
			}),
		});

		if (options.stream == false) {
			const data = await response.json();
			yield { role: "assistant", content: data.results[0].generated_text }
		}

		for await (const chunk of streamSse(response)) {
			yield {
				role: "assistant",
				content: chunk,
			};
		}
	}

	protected async *_streamComplete(
		prompt: string,
		options: CompletionOptions,
	): AsyncGenerator<string> {
		let endpoint = options.stream !== false ? "generation_stream" : "generation"
		console.log(endpoint)

		const response = await this.fetch(new URL(`${this.apiBase}${endpoint}?version=${this.apiVersion}`), {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
			},

			body: JSON.stringify({
				"input": prompt,
				...this._convertArgs(options),
			}),
		});

		if (options.stream == false) {
			const data = await response.json();
			yield data.results[0].generated_text
		}

		for await (const chunk of streamSse(response)) {
			yield chunk.results[0].generated_text
		};
	}
}

export default IBM;
