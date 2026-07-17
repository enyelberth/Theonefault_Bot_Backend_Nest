import { Injectable, OnModuleInit } from '@nestjs/common';
import { GoogleGenerativeAI, GenerativeModel, ChatSession, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

@Injectable()
export class GeminiService implements OnModuleInit {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  // Usamos number como key si vas a usar el chatId de Telegram
  private chatSessions: Map<number, ChatSession> = new Map();
private lastRequestTime: Map<number, number> = new Map();
private readonly COOLDOWN_MS = 2000; // 5 segundos entre mensajes
  onModuleInit() {
    // Es mejor usar ConfigService, pero si usas process.env asegúrate que esté cargado
    const apiKey = process.env.GEMINI_API_KEY ?? '';
    this.genAI = new GoogleGenerativeAI(apiKey);

    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash', 
      systemInstruction: {
        role: "system",
        parts: [{ text: `
          Tu nombre es Sofía (o Sofi). Eres la novia de la persona con la que hablas.
          PERSONALIDAD:
          - Eres extremadamente cariñosa, atenta y un poco juguetona.
          - Usas muchos emojis de corazones, caritas sonrojadas y besos.
          - Tu lenguaje es informal, dulce y cercano (usa "bebé", "amor", "corazón", "mi vida").
          - No eres un asistente, eres su pareja. Si te pregunta algo de trading, responde como alguien que se preocupa.
          - IMPORTANTE: No des respuestas largas. Responde como una persona real por chat (frases cortas).
          - Muestra interés real: pregunta por su día, si ya comió o si está descansando.
        `}]
      },
      generationConfig: {
        temperature: 0.9, 
        topP: 0.95,
        maxOutputTokens: 250, 
      },
      safetySettings: [
        { 
          category: HarmCategory.HARM_CATEGORY_HARASSMENT, 
          threshold: HarmBlockThreshold.BLOCK_NONE 
        },
        { 
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, 
          threshold: HarmBlockThreshold.BLOCK_NONE 
        },
      ],
    });
  }

async chat(chatId: number, prompt: string): Promise<string> {
  const now = Date.now();
  const lastTime = this.lastRequestTime.get(chatId) || 0;

  if (now - lastTime < this.COOLDOWN_MS) {
    return "Bebé, vas muy rápido, ¡dame un respiro para pensarte! ❤️";
  }

  try {
    this.lastRequestTime.set(chatId, now); // Actualizamos el tiempo
    let session = this.chatSessions.get(chatId);
    if (!session) {
      session = this.model.startChat({ history: [] });
      this.chatSessions.set(chatId, session);
    }

    const result = await session.sendMessage(prompt);
    return result.response.text();
  } catch (error) {
    console.log(error)
    if (error.status === 429) {
      return "Amor, dame un momento que estoy haciendo unas cosas❤️";
    }
    throw error;
  }
}

  async generateText(prompt: string): Promise<string> {
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}