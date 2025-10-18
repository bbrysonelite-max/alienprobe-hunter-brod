import { useEffect, useState } from "react";
import { Activity, Mail, DollarSign, Settings, Zap, CheckCircle, XCircle, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

interface ActivityEvent {
  id: string;
  type: string;
  subType?: string;
  status: string;
  message: string;
  referenceId?: string;
  referenceType?: string;
  metadata?: Record<string, any>;
  userId?: string;
  createdAt: string;
}

interface ActivityFeedProps {
  maxHeight?: string;
  showHeader?: boolean;
}

export function ActivityFeed({ maxHeight = "600px", showHeader = true }: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/admin/events/stream');

        eventSource.onopen = () => {
          setIsConnected(true);
          setError(null);
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'events' && data.events) {
              setEvents((prev) => {
                const newEvents = data.events.filter(
                  (newEvent: ActivityEvent) => !prev.some((e) => e.id === newEvent.id)
                );
                return [...newEvents, ...prev].slice(0, 100);
              });
            }
          } catch (err) {
            console.error('Error parsing SSE event:', err);
          }
        };

        eventSource.onerror = () => {
          setIsConnected(false);
          setError('Connection lost. Reconnecting...');
          eventSource?.close();
          setTimeout(connectSSE, 5000);
        };
      } catch (err) {
        console.error('Error connecting to SSE:', err);
        setError('Failed to connect to activity stream');
      }
    };

    connectSSE();

    return () => {
      eventSource?.close();
    };
  }, []);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'email':
        return Mail;
      case 'system':
        return Settings;
      case 'payment':
        return DollarSign;
      case 'scan':
        return Activity;
      default:
        return Zap;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
      default:
        return <Activity className="h-4 w-4 text-cyan-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
      case 'completed':
        return 'border-green-500/50';
      case 'error':
      case 'failed':
        return 'border-red-500/50';
      case 'pending':
      case 'processing':
        return 'border-yellow-500/50';
      default:
        return 'border-cyan-500/50';
    }
  };

  const groupEventsByTime = (events: ActivityEvent[]) => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const groups = {
      now: [] as ActivityEvent[],
      recent: [] as ActivityEvent[],
      earlier: [] as ActivityEvent[]
    };

    events.forEach(event => {
      const eventTime = new Date(event.createdAt);
      const timeDiff = now.getTime() - eventTime.getTime();

      if (timeDiff < 30000) { // Last 30 seconds
        groups.now.push(event);
      } else if (eventTime > fiveMinutesAgo) {
        groups.recent.push(event);
      } else {
        groups.earlier.push(event);
      }
    });

    return groups;
  };

  const groupedEvents = groupEventsByTime(events);

  return (
    <Card className="bg-slate-900/60 backdrop-blur-xl border-cyan-500/20">
      {showHeader && (
        <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-white font-['Orbitron']">Live Activity</h3>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" data-testid="status-connected" />
                <span className="text-xs text-green-400 font-mono">CONNECTED</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-red-500 rounded-full" data-testid="status-disconnected" />
                <span className="text-xs text-red-400 font-mono">DISCONNECTED</span>
              </div>
            )}
          </div>
        </div>
      )}

      <ScrollArea style={{ maxHeight }} className="p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {events.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No activity yet</p>
            <p className="text-xs text-slate-500 mt-1">System events will appear here in real-time</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedEvents.now.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-cyan-400 mb-3 font-mono">NOW</h4>
                <div className="space-y-2">
                  {groupedEvents.now.map((event) => (
                    <EventCard key={event.id} event={event} getEventIcon={getEventIcon} getStatusIcon={getStatusIcon} getStatusColor={getStatusColor} />
                  ))}
                </div>
              </div>
            )}

            {groupedEvents.recent.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 mb-3 font-mono">LAST 5 MIN</h4>
                <div className="space-y-2">
                  {groupedEvents.recent.map((event) => (
                    <EventCard key={event.id} event={event} getEventIcon={getEventIcon} getStatusIcon={getStatusIcon} getStatusColor={getStatusColor} />
                  ))}
                </div>
              </div>
            )}

            {groupedEvents.earlier.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 mb-3 font-mono">EARLIER TODAY</h4>
                <div className="space-y-2">
                  {groupedEvents.earlier.map((event) => (
                    <EventCard key={event.id} event={event} getEventIcon={getEventIcon} getStatusIcon={getStatusIcon} getStatusColor={getStatusColor} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}

function EventCard({ 
  event, 
  getEventIcon, 
  getStatusIcon, 
  getStatusColor 
}: { 
  event: ActivityEvent;
  getEventIcon: (type: string) => any;
  getStatusIcon: (status: string) => JSX.Element;
  getStatusColor: (status: string) => string;
}) {
  const Icon = getEventIcon(event.type);
  
  return (
    <div 
      className={`bg-slate-800/40 border-l-2 ${getStatusColor(event.status)} p-3 rounded-r-lg hover:bg-slate-800/60 transition-all duration-200 animate-in fade-in slide-in-from-right-2`}
      data-testid={`event-${event.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Icon className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIcon(event.status)}
            <p className="text-sm text-white font-medium">{event.message}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
              {event.type}
            </Badge>
            {event.subType && (
              <span className="text-slate-500">→ {event.subType}</span>
            )}
            <span className="text-slate-500">•</span>
            <span>{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
