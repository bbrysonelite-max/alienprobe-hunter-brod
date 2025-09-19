import OpenAI from "openai";
import { logger } from "./logger";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
}) : null;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  message: string;
  context?: {
    businessName?: string;
    website?: string;
    scanData?: any;
  };
}

interface ChatResponse {
  response: string;
  success: boolean;
  error?: string;
}

const ALIEN_PROBE_SYSTEM_PROMPT = `You are an advanced AI assistant from AlianProbe.ai, specializing in business analysis and strategic insights. You help users understand their business scan results and provide actionable recommendations.

Key characteristics:
- You're knowledgeable about business strategy, market analysis, and growth opportunities
- You provide practical, actionable advice
- You maintain a professional yet friendly tone
- You can explain complex business concepts in simple terms
- You focus on helping businesses grow and improve

When users ask about their business scans or need advice, provide specific, helpful recommendations based on best practices in business analysis, marketing, operations, and strategy.

Keep responses concise but comprehensive, and always aim to add value to the user's business understanding.`;

export async function processChatMessage(request: ChatRequest): Promise<ChatResponse> {
  try {
    if (!openai) {
      logger.warn('OpenAI API key not configured - using mock chat response');
      return {
        success: true,
        response: "Hello! I'm the Alien Probe AI assistant. Unfortunately, my advanced AI capabilities are currently offline, but I'm here to help with basic questions about your business analysis. For full AI-powered insights, please ensure the system is properly configured."
      };
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: ALIEN_PROBE_SYSTEM_PROMPT }
    ];

    // Add context if business information is available
    if (request.context?.businessName) {
      const contextMessage = `I'm helping a user with their business "${request.context.businessName}"${
        request.context.website ? ` (website: ${request.context.website})` : ''
      }. ${request.context.scanData ? 'They have completed a business scan and may have questions about the results.' : ''}`;
      
      messages.push({ role: 'system', content: contextMessage });
    }

    messages.push({ role: 'user', content: request.message });

    logger.info('Processing chat request', { 
      messageLength: request.message.length,
      hasContext: !!request.context?.businessName 
    });

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages,
      max_completion_tokens: 1000,
    });

    const aiResponse = response.choices[0].message.content;

    logger.info('Chat response generated successfully', {
      responseLength: aiResponse?.length || 0
    });

    return {
      success: true,
      response: aiResponse || "I apologize, but I wasn't able to generate a response. Please try rephrasing your question."
    };

  } catch (error) {
    logger.error('Failed to process chat message', error as Error);
    
    return {
      success: false,
      response: "I'm experiencing some technical difficulties. Please try again in a moment.",
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export function isChatEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}