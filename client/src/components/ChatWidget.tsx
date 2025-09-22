import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MessageCircle, 
  Send, 
  X, 
  Bot, 
  User, 
  Loader2,
  Minimize2,
  Maximize2
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp?: Date;
  createdAt?: string;
}

interface ChatWidgetProps {
  context?: {
    businessName?: string;
    website?: string;
    scanData?: any;
  };
}

interface ChatStatus {
  chatEnabled: boolean;
  provider: string | null;
}

export default function ChatWidget({ context }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if chat is enabled
  const { data: chatStatus } = useQuery<ChatStatus>({
    queryKey: ["/api", "chat", "status"],
    enabled: isOpen,
  });

  const chatEnabled = chatStatus?.chatEnabled ?? false;

  // Load conversation history
  const loadConversationHistory = async (convId: string) => {
    try {
      setIsLoadingHistory(true);
      const response = await apiRequest("GET", `/api/chat/history/${convId}`);
      const data = await response.json();
      
      if (data.success && data.messages) {
        const formattedMessages = data.messages.map((msg: any) => ({
          id: msg.id,
          content: msg.content,
          role: msg.role,
          createdAt: msg.createdAt
        }));
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.warn('Failed to load conversation history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/chat", {
        message,
        context,
        conversationId
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Update conversation ID if received from server
        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId);
          // Store in localStorage for persistence across browser sessions
          localStorage.setItem('chatConversationId', data.conversationId);
        }
        
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-assistant`,
          content: data.response,
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        toast({
          title: "Chat Error",
          description: data.error || "Failed to send message",
          variant: "destructive"
        });
      }
    },
    onError: () => {
      toast({
        title: "Connection Error",
        description: "Unable to send message. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim() || sendMessageMutation.isPending) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      content: inputMessage.trim(),
      role: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate(inputMessage.trim());
    setInputMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load existing conversation or initialize new one when chat opens
  useEffect(() => {
    if (isOpen && chatEnabled) {
      // Try to get existing conversation ID from localStorage
      const storedConversationId = localStorage.getItem('chatConversationId');
      
      if (storedConversationId && !conversationId) {
        setConversationId(storedConversationId);
        loadConversationHistory(storedConversationId);
      } else if (messages.length === 0) {
        // Show welcome message if no conversation history
        const welcomeMessage: ChatMessage = {
          id: 'welcome-msg',
          content: `Hello! I'm your AlienProbe.ai AI assistant. I'm here to help you understand your business analysis and provide strategic insights. ${context?.businessName ? `I can see you're working with "${context.businessName}". ` : ''}How can I assist you today?`,
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages([welcomeMessage]);
      }
    }
  }, [isOpen, chatEnabled, context?.businessName]);

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg transition-all duration-200 hover:scale-105"
          data-testid="button-open-chat"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className={`w-80 shadow-2xl transition-all duration-300 ${isMinimized ? 'h-16' : 'h-96'}`}>
        <CardHeader className="p-3 bg-primary text-primary-foreground rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-foreground/20 rounded-full flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-medium">AlienProbe.ai AI</CardTitle>
                <div className="flex items-center space-x-1">
                  {chatEnabled ? (
                    <>
                      <div className="w-2 h-2 bg-green-400 rounded-full" />
                      <span className="text-xs opacity-90">Online</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-orange-400 rounded-full" />
                      <span className="text-xs opacity-90">Limited Mode</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                onClick={() => setIsMinimized(!isMinimized)}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-primary-foreground hover:bg-primary-foreground/20"
                data-testid="button-minimize-chat"
              >
                {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </Button>
              <Button
                onClick={() => setIsOpen(false)}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-primary-foreground hover:bg-primary-foreground/20"
                data-testid="button-close-chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {!isMinimized && (
          <CardContent className="p-0 flex flex-col h-80">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {isLoadingHistory && (
                <div className="text-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Loading conversation history...</p>
                </div>
              )}
              {!chatEnabled && (
                <div className="text-center p-4">
                  <Badge variant="outline" className="mb-2">
                    Limited Mode
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Advanced AI features are currently unavailable. Basic assistance is still available.
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex items-start space-x-2 max-w-[85%] ${
                      message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {message.role === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                    </div>
                    <div
                      className={`rounded-lg p-2 text-sm ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}

              {sendMessageMutation.isPending && (
                <div className="flex justify-start">
                  <div className="flex items-start space-x-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
                      <Bot className="h-3 w-3" />
                    </div>
                    <div className="bg-muted rounded-lg p-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t">
              <div className="flex space-x-2">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me about your business analysis..."
                  className="flex-1 text-sm border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[36px] max-h-20"
                  rows={1}
                  data-testid="input-chat-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || sendMessageMutation.isPending}
                  size="sm"
                  className="h-9 w-9 p-0"
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}