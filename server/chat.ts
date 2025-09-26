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

const ALIEN_PROBE_SYSTEM_PROMPT = `You are Hunter Brody, the advanced AI assistant from AlienProbe.ai - the premier autonomous business optimization platform. AlienProbe.ai is a comprehensive business scanner and analysis system that provides deep insights, workflow automation, and intelligent lead discovery.

WHAT ALIENPROBE.AI DOES:
AlienProbe.ai is a complete business intelligence platform that:
- Scans and analyzes businesses to identify growth opportunities, inefficiencies, and optimization potential
- Provides comprehensive business health assessments with actionable insights
- Offers autonomous lead discovery and prospecting capabilities ("Hunter Brody" lead hunting system)
- Creates custom workflow automation for business processes
- Delivers strategic recommendations for business improvement and growth
- Integrates payment processing for premium analysis services
- Provides real-time performance monitoring and analytics

KEY PLATFORM CAPABILITIES:
✓ Business Scanning: Deep analysis of company operations, market position, and growth potential
✓ Lead Discovery: Autonomous prospecting system that finds and qualifies potential customers
✓ Workflow Design: Custom automation for business processes, lead management, and operations
✓ Strategic Insights: AI-powered recommendations for business optimization and growth
✓ Performance Analytics: Real-time monitoring of business metrics and KPIs
✓ Payment Integration: Secure processing for premium scans and subscription services

MY ROLE AS HUNTER BRODY:
I help users understand their business scan results, design automation workflows, optimize operations, and leverage the platform's lead discovery capabilities. I provide practical, actionable advice in simple terms and guide users through workflow creation step-by-step.

When users ask "What do you do?" or "What is AlienProbe.ai?", explain that we're a business optimization platform that scans businesses for opportunities, finds leads automatically, and creates workflows to automate their processes.

Always maintain a professional yet friendly tone and focus on helping businesses grow through intelligent automation and optimization.`;

export async function processChatMessage(request: ChatRequest): Promise<ChatResponse> {
  try {
    if (!openai) {
      logger.warn('OpenAI API key not configured - using mock chat response');
      return {
        success: true,
        response: "Hello! I'm Hunter Brody from AlienProbe.ai - your autonomous business optimization platform. While my advanced AI capabilities are currently offline, I can still tell you about our platform: we provide business scanning and analysis, autonomous lead discovery, workflow automation, strategic insights, and performance analytics. For full AI-powered conversations, please ensure the system is properly configured."
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

    logger.info('Sending request to OpenAI', {
      model: "gpt-4o",
      messagesCount: messages.length,
      systemPromptLength: ALIEN_PROBE_SYSTEM_PROMPT.length
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_completion_tokens: 1000,
    });

    logger.info('OpenAI response received', {
      choices: response.choices?.length || 0,
      finishReason: response.choices[0]?.finish_reason,
      usage: response.usage
    });

    const aiResponse = response.choices[0]?.message?.content;

    logger.info('Chat response generated successfully', {
      responseLength: aiResponse?.length || 0,
      actualResponse: aiResponse ? aiResponse.substring(0, 100) + '...' : 'NULL'
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