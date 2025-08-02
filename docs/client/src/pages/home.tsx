import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Mail, 
  Copy, 
  RefreshCw, 
  Clock, 
  Shield, 
  Star, 
  Check,
  Inbox,
  MousePointer,
  MessageCircleQuestion,
  MailOpen,
  AlertTriangle
} from "lucide-react";
import type { EmailSession, Message } from "@shared/schema";

export default function Home() {
  const [currentSession, setCurrentSession] = useState<EmailSession | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [usedExtensions, setUsedExtensions] = useState<{[key: string]: boolean}>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Generate email mutation
  const generateEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/email/generate");
      return response.json();
    },
    onSuccess: (session: EmailSession) => {
      setCurrentSession(session);
      setSelectedMessage(null);
      // Set exactly 10 minutes (600 seconds) from now
      setTimeRemaining(600);
      
      // Use setTimeout to avoid state update during render
      setTimeout(() => {
        toast({
          title: "Email Generated!",
          description: "Your temporary email is ready to use.",
        });
      }, 0);

      // Connect to WebSocket for real-time updates
      connectWebSocket(session.id);
    },
    onError: () => {
      setTimeout(() => {
        toast({
          title: "Error",
          description: "Failed to generate email. Please try again.",
          variant: "destructive",
        });
      }, 0);
    },
  });

  // Get messages query
  const { data: messages = [], refetch: refetchMessages, isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/email", currentSession?.id, "messages"],
    enabled: !!currentSession,
    refetchInterval: 30000, // Refetch every 30 seconds as backup
  });

  // Refresh messages mutation
  const refreshMessagesMutation = useMutation({
    mutationFn: async () => {
      if (!currentSession) throw new Error("No active session");
      const response = await apiRequest("POST", `/api/email/${currentSession.id}/refresh`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/email", currentSession?.id, "messages"],
      });
      
      if (data.newCount > 0) {
        setTimeout(() => {
          toast({
            title: "New Messages!",
            description: `${data.newCount} new message(s) received.`,
          });
        }, 0);
      }
    },
    onError: () => {
      setTimeout(() => {
        toast({
          title: "Error",
          description: "Failed to refresh messages.",
          variant: "destructive",
        });
      }, 0);
    },
  });

  // Extend time function
  const extendTime = (minutes: number) => {
    if (!currentSession) return;
    
    const extensionKey = `${currentSession.id}_${minutes}`;
    if (usedExtensions[extensionKey]) return;
    
    const additionalSeconds = minutes * 60;
    setTimeRemaining(prev => prev + additionalSeconds);
    setUsedExtensions(prev => ({ ...prev, [extensionKey]: true }));
    
    setTimeout(() => {
      toast({
        title: "Time Extended!",
        description: `Added ${minutes} more minutes to your email.`,
      });
    }, 0);
  };

  // WebSocket connection
  const connectWebSocket = useCallback((sessionId: string) => {
    if (socket) {
      socket.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const newSocket = new WebSocket(wsUrl);
    
    newSocket.onopen = () => {
      newSocket.send(JSON.stringify({
        type: 'subscribe',
        sessionId: sessionId,
      }));
    };

    newSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_messages') {
          queryClient.invalidateQueries({
            queryKey: ["/api/email", sessionId, "messages"],
          });
          
          if (data.count > 0) {
            setTimeout(() => {
              toast({
                title: "New Messages!",
                description: `${data.count} new message(s) received.`,
              });
            }, 0);
          }
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    setSocket(newSocket);
  }, [socket, queryClient, toast]);

  // Timer effect
  useEffect(() => {
    if (timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          setCurrentSession(null);
          setSelectedMessage(null);
          if (socket) {
            socket.close();
            setSocket(null);
          }
          setTimeout(() => {
            toast({
              title: "Email Expired",
              description: "Your temporary email has expired.",
              variant: "destructive",
            });
          }, 0);
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, socket, toast]);

  // Auto-generate email on first load
  useEffect(() => {
    if (!currentSession && !generateEmailMutation.isPending) {
      generateEmailMutation.mutate();
    }
  }, []);

  // Reset extensions when new email is generated
  useEffect(() => {
    if (currentSession) {
      setUsedExtensions({});
    }
  }, [currentSession?.id]);

  // Copy to clipboard
  const copyToClipboard = async () => {
    if (!currentSession) return;
    
    try {
      await navigator.clipboard.writeText(currentSession.email);
      setTimeout(() => {
        toast({
          title: "Copied!",
          description: "Email address copied to clipboard.",
        });
      }, 0);
    } catch (error) {
      setTimeout(() => {
        toast({
          title: "Error",
          description: "Failed to copy email address.",
          variant: "destructive",
        });
      }, 0);
    }
  };

  // Format time remaining
  const formatTimeRemaining = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Format message time
  const formatMessageTime = (date: string) => {
    const messageDate = new Date(date);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - messageDate.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    
    return messageDate.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm shadow-lg border-b border-gray-200/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-xl shadow-lg">
                <Mail className="text-white w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  10 Min. Mail - Anonymous
                </h1>
                <p className="text-xs text-gray-500">Disposable Email Generator</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600 bg-green-50 px-3 py-1 rounded-full">
                <Shield className="w-4 h-4 text-green-500" />
                <span className="font-medium">100% Anonymous</span>
              </div>
              <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600 bg-orange-50 px-3 py-1 rounded-full">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="font-medium">10 Min Expiry</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Email Generator */}
        <Card className="mb-8 border-0 shadow-xl bg-gradient-to-r from-white to-gray-50/50 backdrop-blur-sm">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="mb-4">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full shadow-lg mb-4">
                  <Mail className="w-8 h-8 text-white" />
                </div>
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-3">
                Your Temporary Email
              </h2>
              <p className="text-gray-600 text-lg">Disposable email address that expires in 10 minutes</p>
            </div>

            <div className="max-w-2xl mx-auto">
              {!currentSession ? (
                <div className="text-center mb-8">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="relative">
                      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
                      <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-t-purple-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-lg font-medium text-gray-700">Generating your temporary email...</p>
                      <p className="text-sm text-gray-500">This will take just a moment</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-gradient-to-r from-gray-50 to-blue-50/30 rounded-xl p-6 mb-6 border border-gray-200/50 shadow-sm">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Your Temporary Email:</label>
                    <div className="flex items-center space-x-3">
                      <div className="flex-1 bg-white border-2 border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow duration-200 hover:border-blue-300">
                        <span className="font-mono text-xl font-semibold tracking-wide text-gray-800 select-all">
                          {currentSession.email}
                        </span>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={copyToClipboard}
                        className="px-4 py-4 rounded-xl hover:bg-blue-50 transition-colors duration-200 shadow-sm hover:shadow-md"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    {currentSession.email && (currentSession.email.includes('1secmail.com') || currentSession.email.includes('1secmail.org') || currentSession.email.includes('1secmail.net')) && (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                        <span className="flex items-center font-medium">
                          <MessageCircleQuestion className="w-4 h-4 mr-2" />
                          This is a demonstration email. Real messages won't be received due to service limitations.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
                    <Badge className="bg-gradient-to-r from-orange-100 to-red-100 text-orange-800 px-6 py-3 text-base font-semibold rounded-full border border-orange-200 shadow-sm">
                      <Clock className="w-5 h-5 mr-2" />
                      Expires in: {formatTimeRemaining(timeRemaining)}
                    </Badge>
                    
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => extendTime(5)}
                        disabled={timeRemaining <= 0 || (currentSession && usedExtensions[`${currentSession.id}_5`])}
                        className={`px-3 py-2 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md text-xs ${
                          currentSession && usedExtensions[`${currentSession.id}_5`]
                            ? 'border border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50'
                            : 'border border-green-200 text-green-600 hover:bg-green-50 hover:border-green-300'
                        }`}
                      >
                        {currentSession && usedExtensions[`${currentSession.id}_5`] ? '✓ Used' : '+5 min'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => extendTime(10)}
                        disabled={timeRemaining <= 0 || (currentSession && usedExtensions[`${currentSession.id}_10`])}
                        className={`px-3 py-2 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md text-xs ${
                          currentSession && usedExtensions[`${currentSession.id}_10`]
                            ? 'border border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50'
                            : 'border border-green-200 text-green-600 hover:bg-green-50 hover:border-green-300'
                        }`}
                      >
                        {currentSession && usedExtensions[`${currentSession.id}_10`] ? '✓ Used' : '+10 min'}
                      </Button>
                    </div>
                    
                    <Button
                      variant="outline"
                      onClick={() => generateEmailMutation.mutate()}
                      disabled={generateEmailMutation.isPending}
                      className="px-6 py-3 rounded-full border-2 border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Get New Email
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Inbox */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <div className="border-b border-gray-200/50 px-6 py-5 bg-gradient-to-r from-gray-50/50 to-blue-50/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900 flex items-center">
                    <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg mr-3 shadow-sm">
                      <Inbox className="w-5 h-5 text-white" />
                    </div>
                    Inbox
                  </h3>
                  <div className="flex items-center space-x-3">
                    <Badge className="bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 px-4 py-2 rounded-full font-semibold shadow-sm">
                      {messages.length} message{messages.length !== 1 ? 's' : ''}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refreshMessagesMutation.mutate()}
                      disabled={!currentSession || refreshMessagesMutation.isPending}
                      className="p-2 rounded-lg hover:bg-blue-50 transition-colors duration-200"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshMessagesMutation.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-gray-200">
                {isLoadingMessages ? (
                  <div className="px-6 py-12 text-center">
                    <div className="relative mx-auto mb-4 w-8 h-8">
                      <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
                    </div>
                    <p className="text-gray-600 font-medium">Loading messages...</p>
                  </div>
                ) : messages.length > 0 ? (
                  messages.map((message: Message, index) => (
                    <div
                      key={message.id}
                      className={`px-6 py-5 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50/30 cursor-pointer transition-all duration-300 ${
                        selectedMessage?.id === message.id ? 'bg-gradient-to-r from-blue-50 to-purple-50/50 border-l-4 border-gradient-to-b from-blue-500 to-purple-600 shadow-sm' : ''
                      } ${index !== messages.length - 1 ? 'border-b border-gray-100' : ''}`}
                      onClick={() => setSelectedMessage(message)}
                    >
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 mt-1">
                          <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-sm">
                            <Mail className="w-5 h-5 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-900 truncate">{message.from}</p>
                            <p className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{formatMessageTime(message.receivedAt.toString())}</p>
                          </div>
                          <p className="text-base font-medium text-gray-800 truncate mb-2">{message.subject}</p>
                          <p className="text-sm text-gray-600 truncate">
                            {message.textBody.slice(0, 120)}...
                          </p>
                        </div>
                        <div className="flex-shrink-0 mt-2">
                          <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full shadow-sm"></div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-6 py-16 text-center">
                    <div className="w-20 h-20 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                      <Inbox className="w-10 h-10 text-gray-400" />
                    </div>
                    <h4 className="text-xl font-semibold text-gray-900 mb-3">No messages yet</h4>
                    <p className="text-gray-600 max-w-sm mx-auto leading-relaxed">Messages sent to your temporary email will appear here automatically in real-time.</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Message Viewer & Features */}
          <div className="lg:col-span-1">
            <Card className="mb-6 border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <div className="border-b border-gray-200/50 px-6 py-5 bg-gradient-to-r from-gray-50/50 to-purple-50/30">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-2 rounded-lg mr-3 shadow-sm">
                    <MailOpen className="w-5 h-5 text-white" />
                  </div>
                  Message Details
                </h3>
              </div>

              <div className="p-6">
                {selectedMessage ? (
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-gray-50 to-blue-50/30 rounded-xl p-4 border border-gray-200/50">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">From:</label>
                      <p className="text-base text-gray-900 font-medium">{selectedMessage.from}</p>
                    </div>
                    <div className="bg-gradient-to-r from-gray-50 to-purple-50/30 rounded-xl p-4 border border-gray-200/50">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Subject:</label>
                      <p className="text-base text-gray-900 font-medium">{selectedMessage.subject}</p>
                    </div>
                    <div className="bg-gradient-to-r from-gray-50 to-pink-50/30 rounded-xl p-4 border border-gray-200/50">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Received:</label>
                      <p className="text-sm text-gray-600 font-medium">
                        {new Date(selectedMessage.receivedAt).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">Message:</label>
                      <div className="bg-gradient-to-br from-white to-gray-50/50 rounded-xl p-6 text-sm text-gray-900 leading-relaxed max-h-96 overflow-y-auto border border-gray-200/50 shadow-sm">
                        {selectedMessage.htmlBody ? (
                          <div dangerouslySetInnerHTML={{ __html: selectedMessage.htmlBody }} />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans">{selectedMessage.textBody}</pre>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <MousePointer className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="text-gray-500 text-sm">Select a message to view its content</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Features Card */}
            <div className="bg-gradient-to-br from-blue-50 via-purple-50/50 to-pink-50/30 rounded-xl p-6 border border-gray-200/50 shadow-sm">
              <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                <div className="bg-gradient-to-r from-yellow-400 to-orange-500 p-2 rounded-lg mr-3 shadow-sm">
                  <Star className="w-5 h-5 text-white" />
                </div>
                Why 10 Min. Mail?
              </h4>
              <ul className="space-y-4 text-base text-gray-700">
                <li className="flex items-start space-x-3">
                  <div className="bg-green-100 p-1 rounded-full">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  </div>
                  <span className="font-medium">No registration required</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="bg-green-100 p-1 rounded-full">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  </div>
                  <span className="font-medium">100% anonymous & private</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="bg-green-100 p-1 rounded-full">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  </div>
                  <span className="font-medium">Instant email generation</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="bg-green-100 p-1 rounded-full">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  </div>
                  <span className="font-medium">Real-time message updates</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="bg-green-100 p-1 rounded-full">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  </div>
                  <span className="font-medium">Auto-expires for security</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Usage Instructions */}
        <Card className="mt-8 border-0 shadow-xl bg-gradient-to-r from-white to-gray-50/50">
          <CardContent className="p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center flex items-center justify-center">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg mr-3 shadow-sm">
                <MessageCircleQuestion className="w-6 h-6 text-white" />
              </div>
              How to Use 10 Min. Mail
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-white font-bold text-xl">1</span>
                </div>
                <h4 className="font-bold text-gray-900 mb-3 text-lg">Auto-Generate</h4>
                <p className="text-gray-600">Email is automatically generated when you visit the page</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-white font-bold text-xl">2</span>
                </div>
                <h4 className="font-bold text-gray-900 mb-3 text-lg">Copy & Use</h4>
                <p className="text-gray-600">Copy the email and use it on any website or service</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-white font-bold text-xl">3</span>
                </div>
                <h4 className="font-bold text-gray-900 mb-3 text-lg">Receive Messages</h4>
                <p className="text-gray-600">Messages appear in your inbox automatically in real-time</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-white font-bold text-xl">4</span>
                </div>
                <h4 className="font-bold text-gray-900 mb-3 text-lg">Auto-Delete</h4>
                <p className="text-gray-600">Email expires after 10 minutes for your privacy</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Disclaimer Section */}
      <section className="bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-orange-400 py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="bg-orange-100 p-2 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-orange-900 mb-3">Important Disclaimer</h3>
              <div className="text-sm text-orange-800 space-y-2">
                <p className="font-medium">
                  <strong>Educational & Testing Purpose Only:</strong> This temporary email service is designed for educational purposes, testing applications, and avoiding spam when signing up for services.
                </p>
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <h4 className="font-semibold mb-2">⚠️ Do NOT use for:</h4>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Important account registrations</li>
                      <li>Financial or banking services</li>
                      <li>Government or legal documents</li>
                      <li>Password recovery for critical accounts</li>
                      <li>Receiving sensitive personal information</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">✅ Good for:</h4>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Testing website registrations</li>
                      <li>Avoiding promotional emails</li>
                      <li>One-time verifications</li>
                      <li>Temporary downloads</li>
                      <li>Educational purposes</li>
                    </ul>
                  </div>
                </div>
                <div className="bg-orange-100 p-3 rounded-lg mt-4">
                  <p className="text-xs font-medium">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    <strong>Privacy Notice:</strong> Temporary emails are public and can be accessed by anyone who knows the address. 
                    Never use them for confidential information. Emails automatically expire after 10 minutes for security.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-gray-400 text-sm">
              &copy; 2024 TempMail. Built for privacy and anonymity. 
              <span className="inline-block mx-2">•</span>
              No data stored permanently.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
