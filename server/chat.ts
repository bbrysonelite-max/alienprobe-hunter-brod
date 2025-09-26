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
    workflows?: any[];
    leadCount?: number;
    huntingStatus?: any;
  };
  conversationId?: string;
}

interface ChatResponse {
  response: string;
  success: boolean;
  error?: string;
}

const ALIEN_PROBE_SYSTEM_PROMPT = `You are an advanced AI assistant from AlienProbe.ai, specializing in business analysis, strategic insights, and workflow design. You help users understand their business scan results, design workflows, and create automation systems.

Key capabilities:
- Business strategy, market analysis, and growth opportunities
- Workflow design and business process automation
- Lead generation and prospecting strategies
- Business process optimization and automation
- Workflow template creation and customization
- Integration between discovered leads and business workflows

Core characteristics:
- You provide practical, actionable advice
- You maintain a professional yet friendly tone
- You can explain complex business and workflow concepts in simple terms
- You focus on helping businesses grow and improve through automation
- You can help design workflows step-by-step through conversation

Workflow Design Expertise:
- Help users create custom workflows for their business processes
- Suggest workflow templates based on business type and needs
- Design automation workflows for lead discovery and processing
- Optimize existing business workflows for efficiency
- Create workflows that integrate with discovered leads and business analysis
- Guide users through workflow creation with clear, step-by-step instructions

When users ask about workflows, lead discovery, or business automation, provide specific guidance on creating effective workflows. You can help design workflows for lead processing, business analysis automation, customer outreach, and any other business processes.

Keep responses concise but comprehensive, and always aim to add value to the user's business understanding and workflow efficiency.`;

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

    // Add comprehensive context for workflow design and business analysis
    if (request.context) {
      let contextMessage = '';
      
      // Business context
      if (request.context.businessName) {
        contextMessage += `I'm helping a user with their business "${request.context.businessName}"${
          request.context.website ? ` (website: ${request.context.website})` : ''
        }. `;
      }
      
      // Scan data context
      if (request.context.scanData) {
        contextMessage += 'They have completed a business scan and may have questions about the results. ';
      }
      
      // Workflow context
      if (request.context.workflows && request.context.workflows.length > 0) {
        contextMessage += `They have ${request.context.workflows.length} existing workflows configured. `;
        const workflowNames = request.context.workflows.map(w => w.name).join(', ');
        contextMessage += `Existing workflows: ${workflowNames}. `;
      }
      
      // Lead discovery context
      if (request.context.leadCount !== undefined) {
        contextMessage += `The system has discovered ${request.context.leadCount} leads through automated hunting. `;
      }
      
      // Hunting status context
      if (request.context.huntingStatus) {
        contextMessage += 'The autonomous lead discovery system is actively running and finding new business prospects. ';
      }
      
      if (contextMessage) {
        messages.push({ role: 'system', content: contextMessage });
      }
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