// src/components/ResearchSummaryGenerator.tsx
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileText, 
  Send, 
  History, 
  Plus, 
  Trash2, 
  BookOpen,
  Zap,
  Sparkles,
  MessageSquare,
  User,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Type,
  Search,
  BarChart3,
  TrendingUp,
  GitBranch
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiService, type Paper, type SearchResponse, type SummaryResponse, type ModelInfo } from "@/data/data";
import { useToast } from "@/hooks/use-toast";
import { safeFormatText, truncateText, formatDate, getDisplayName } from "@/utils/formatText";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  type?: "search" | "summary" | "comparison" | "gap_analysis" | "trend_analysis" | "message";
  data?: any;
  expanded?: boolean;
};

type ChatHistory = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  query?: string;
  paperCount?: number;
};

type QuickAction = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  type: "summary" | "comparison" | "gap_analysis" | "trend_analysis" | "literature_review";
};

export default function ResearchSummaryGenerator() {
  const [paperCount, setPaperCount] = useState(5);
  const [currentInput, setCurrentInput] = useState("");
  const [currentChat, setCurrentChat] = useState<Message[]>([]);
  const [chatHistories, setChatHistories] = useState<ChatHistory[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState("llama3.2:3b");
  const [healthStatus, setHealthStatus] = useState({
    ollama: false,
    api: false
  });
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);
  
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Quick actions configuration
  const quickActions: QuickAction[] = [
    {
      id: "summary",
      title: "Quick Summary",
      description: "Get a concise summary of research papers",
      icon: <FileText className="h-5 w-5" />,
      type: "summary"
    },
    {
      id: "comparison",
      title: "Compare Papers",
      description: "Detailed comparison of methodologies and findings",
      icon: <BarChart3 className="h-5 w-5" />,
      type: "comparison"
    },
    {
      id: "gap_analysis",
      title: "Gap Analysis",
      description: "Identify research gaps and opportunities",
      icon: <GitBranch className="h-5 w-5" />,
      type: "gap_analysis"
    },
    {
      id: "trend_analysis",
      title: "Trend Analysis",
      description: "Analyze research trends and future directions",
      icon: <TrendingUp className="h-5 w-5" />,
      type: "trend_analysis"
    }
  ];

  // Initialize health check and models
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      const health = await apiService.healthCheck();
      setHealthStatus({
        ollama: health.ollama_available,
        api: true
      });
      
      if (health.ollama_available) {
        const modelsResponse = await apiService.getModels();
        setAvailableModels(modelsResponse.available_models);
        setCurrentModel(modelsResponse.current_model);
      }
      
      // Load saved chat histories from localStorage
      const savedHistories = localStorage.getItem('research_chat_histories');
      if (savedHistories) {
        const parsedHistories = JSON.parse(savedHistories).map((history: any) => ({
          ...history,
          createdAt: new Date(history.createdAt),
          messages: history.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }));
        setChatHistories(parsedHistories);
      }
      
    } catch (error) {
      console.error('Failed to initialize app:', error);
      toast({
        title: "Connection Error",
        description: "Unable to connect to the backend server",
        variant: "destructive",
      });
    }
  };

  // Save chat histories to localStorage
  useEffect(() => {
    if (chatHistories.length > 0) {
      localStorage.setItem('research_chat_histories', JSON.stringify(chatHistories));
    }
  }, [chatHistories]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    scrollToBottom();
  }, [currentChat, isGenerating]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (quickActionType?: string) => {
    const query = currentInput.trim();
    if (!query || !healthStatus.api) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date(),
      type: "message"
    };

    const updatedChat = [...currentChat, userMessage];
    setCurrentChat(updatedChat);
    setCurrentInput("");
    setIsGenerating(true);
    setActiveQuickAction(quickActionType || null);

    try {
      let response;
      
      if (quickActionType === "comparison") {
        response = await handleComparison(query);
      } else if (quickActionType === "gap_analysis") {
        response = await handleGapAnalysis(query);
      } else if (quickActionType === "trend_analysis") {
        response = await handleTrendAnalysis(query);
      } else {
        response = await handleSummary(query);
      }

      if (response.success) {
        toast({
          title: "Analysis Complete",
          description: `Successfully processed ${response.papers_used || response.papers_compared || 0} papers`,
        });
      }
    } catch (error) {
      console.error('API Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Sorry, I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        type: "message"
      };
      setCurrentChat(prev => [...prev, errorMessage]);
      
      toast({
        title: "Error",
        description: "Failed to process research request",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      setActiveQuickAction(null);
    }
  };

  const handleSummary = async (query: string) => {
    const searchResponse = await apiService.searchPapers(query, paperCount, currentModel);

    if (searchResponse.success && searchResponse.papers.length > 0) {
      const searchMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Found ${searchResponse.papers.length} papers on "${searchResponse.query}". Now generating summary...`,
        timestamp: new Date(),
        type: "search",
        data: searchResponse,
        expanded: false
      };
      
      setCurrentChat(prev => [...prev, searchMessage]);

      const summaryResponse = await apiService.summarizePapers(query, paperCount, currentModel);

      if (summaryResponse.success) {
        const summaryMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: summaryResponse.summary,
          timestamp: new Date(),
          type: "summary",
          data: summaryResponse
        };
        
        setCurrentChat(prev => [...prev, summaryMessage]);
        return summaryResponse;
      }
    }
    throw new Error(searchResponse.error || "No papers found");
  };

  const handleComparison = async (query: string) => {
    const searchResponse = await apiService.searchPapers(query, paperCount, currentModel);

    if (searchResponse.success && searchResponse.papers.length > 0) {
      const searchMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Found ${searchResponse.papers.length} papers on "${searchResponse.query}". Now generating comparison...`,
        timestamp: new Date(),
        type: "search",
        data: searchResponse,
        expanded: false
      };
      
      setCurrentChat(prev => [...prev, searchMessage]);

      const comparisonResponse = await apiService.comparePapers(query, paperCount, currentModel);

      if (comparisonResponse.success) {
        const comparisonMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: comparisonResponse.comparison_text,
          timestamp: new Date(),
          type: "comparison",
          data: comparisonResponse
        };
        
        setCurrentChat(prev => [...prev, comparisonMessage]);
        return comparisonResponse;
      }
    }
    throw new Error(searchResponse.error || "No papers found");
  };

  const handleGapAnalysis = async (query: string) => {
    const gapAnalysisResponse = await apiService.executeTool('analyze_research_gaps', {
      query,
      max_results: paperCount,
      model: currentModel
    });

    if (gapAnalysisResponse.success) {
      const gapMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: gapAnalysisResponse.data?.gap_analysis || "Research gap analysis completed",
        timestamp: new Date(),
        type: "gap_analysis",
        data: gapAnalysisResponse.data
      };
      
      setCurrentChat(prev => [...prev, gapMessage]);
      return gapAnalysisResponse;
    }
    throw new Error(gapAnalysisResponse.message || "Gap analysis failed");
  };

  const handleTrendAnalysis = async (query: string) => {
    const trendAnalysisResponse = await apiService.executeTool('analyze_trends', {
      query,
      max_results: paperCount,
      model: currentModel
    });

    if (trendAnalysisResponse.success) {
      const trendMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: trendAnalysisResponse.data?.trend_analysis || "Trend analysis completed",
        timestamp: new Date(),
        type: "trend_analysis",
        data: trendAnalysisResponse.data
      };
      
      setCurrentChat(prev => [...prev, trendMessage]);
      return trendAnalysisResponse;
    }
    throw new Error(trendAnalysisResponse.message || "Trend analysis failed");
  };

  const togglePapersExpansion = (messageId: string) => {
    setCurrentChat(prev => prev.map(message => 
      message.id === messageId 
        ? { ...message, expanded: !message.expanded }
        : message
    ));
  };

  const handleNewChat = () => {
    if (currentChat.length > 0) {
      const newHistory: ChatHistory = {
        id: Date.now().toString(),
        title: currentChat[0]?.content.slice(0, 30) + "..." || "New Chat",
        messages: currentChat,
        createdAt: new Date(),
        query: currentChat[0]?.content,
        paperCount: paperCount
      };
      const updatedHistories = [newHistory, ...chatHistories];
      setChatHistories(updatedHistories);
      localStorage.setItem('research_chat_histories', JSON.stringify(updatedHistories));
    }
    setCurrentChat([]);
    setSelectedHistoryId(null);
  };

  const handleLoadHistory = (historyId: string) => {
    const history = chatHistories.find((h) => h.id === historyId);
    if (history) {
      setCurrentChat(history.messages);
      setSelectedHistoryId(historyId);
    }
  };

  const handleDeleteHistory = (historyId: string) => {
    const updatedHistories = chatHistories.filter((h) => h.id !== historyId);
    setChatHistories(updatedHistories);
    localStorage.setItem('research_chat_histories', JSON.stringify(updatedHistories));
    
    if (selectedHistoryId === historyId) {
      setCurrentChat([]);
      setSelectedHistoryId(null);
    }
  };

  const handleModelChange = async (model: string) => {
    try {
      await apiService.setModel(model);
      setCurrentModel(model);
      toast({
        title: "Model Updated",
        description: `Switched to ${model}`,
      });
    } catch (error) {
      toast({
        title: "Model Change Failed",
        description: "Failed to switch model",
        variant: "destructive",
      });
    }
  };

  const renderMessageContent = (message: Message) => {
    const formatContent = (content: string) => {
      const formatted = safeFormatText(content);
      return <div dangerouslySetInnerHTML={{ __html: formatted }} />;
    };

    if (message.type === "search" && message.data) {
      const showExpandButton = message.data.papers.length > 3;
      const displayedPapers = message.expanded 
        ? message.data.papers 
        : message.data.papers.slice(0, 3);

      return (
        <div className="space-y-3">
          {formatContent(message.content)}
          <div className="bg-slate-50 rounded-lg p-4">
            <h4 className="font-semibold mb-2">Found Papers:</h4>
            <div className="space-y-3">
              {displayedPapers.map((paper: Paper, index: number) => (
                <div key={index} className="text-sm border-l-2 border-blue-500 pl-3 py-2 bg-white rounded-r-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 mb-1">{paper.title}</p>
                      <p className="text-slate-600 mb-1">By {paper.authors.join(", ")}</p>
                      {paper.summary && (
                        <p className="text-slate-500 text-xs mb-2 line-clamp-2">
                          {truncateText(paper.summary, 150)}
                        </p>
                      )}
                    </div>
                    {paper.link && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 text-slate-400 hover:text-blue-600"
                        asChild
                      >
                        <a href={paper.link} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              
              {showExpandButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  onClick={() => togglePapersExpansion(message.id)}
                >
                  <div className="flex items-center gap-2">
                    {message.expanded ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        Show fewer papers
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Show all {message.data.papers.length} papers
                      </>
                    )}
                  </div>
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }
    
    if (message.type === "summary" && message.data) {
      return (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <h4 className="font-semibold text-green-800 mb-1">
              Research Summary ({message.data.papers_used} papers analyzed)
            </h4>
            <p className="text-green-700 text-sm">
              Generated using {message.data.model}
            </p>
          </div>
          <div className="whitespace-pre-wrap leading-relaxed formatted-content">
            {formatContent(message.content)}
          </div>
          {message.data.saved_path && (
            <p className="text-xs text-slate-500 mt-2">
              Summary saved to: {message.data.saved_path}
            </p>
          )}
        </div>
      );
    }

    if (message.type === "comparison" && message.data) {
      return (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h4 className="font-semibold text-blue-800 mb-1">
              Paper Comparison ({message.data.papers_compared} papers compared)
            </h4>
            <p className="text-blue-700 text-sm">
              Generated using {message.data.model}
            </p>
          </div>
          <div className="whitespace-pre-wrap leading-relaxed formatted-content">
            {formatContent(message.content)}
          </div>
        </div>
      );
    }

    if (message.type === "gap_analysis") {
      return (
        <div className="space-y-3">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <h4 className="font-semibold text-purple-800 mb-1">
              Research Gap Analysis
            </h4>
            <p className="text-purple-700 text-sm">
              Identified gaps and research opportunities
            </p>
          </div>
          <div className="whitespace-pre-wrap leading-relaxed formatted-content">
            {formatContent(message.content)}
          </div>
        </div>
      );
    }

    if (message.type === "trend_analysis") {
      return (
        <div className="space-y-3">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <h4 className="font-semibold text-orange-800 mb-1">
              Research Trend Analysis
            </h4>
            <p className="text-orange-700 text-sm">
              Emerging trends and future directions
            </p>
          </div>
          <div className="whitespace-pre-wrap leading-relaxed formatted-content">
            {formatContent(message.content)}
          </div>
        </div>
      );
    }

    return (
      <div className="whitespace-pre-wrap leading-relaxed formatted-content">
        {formatContent(message.content)}
      </div>
    );
  };

  // CSS for formatted content
  const formattedStyles = `
    .formatted-content strong {
      font-weight: bold;
      color: inherit;
    }
    .formatted-content em {
      font-style: italic;
      color: inherit;
    }
    .formatted-content .inline-code {
      background-color: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 0.1rem 0.3rem;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.875em;
      color: #334155;
    }
    .formatted-content br {
      content: '';
      display: block;
      margin-top: 0.5em;
    }
    .user-message .formatted-content strong {
      color: #dbeafe;
    }
    .user-message .formatted-content em {
      color: #dbeafe;
    }
    .user-message .formatted-content .inline-code {
      background-color: #3b82f6;
      border-color: #60a5fa;
      color: #eff6ff;
    }
  `;

  return (
    <>
      <style>{formattedStyles}</style>
      <div className="flex h-screen w-full bg-gradient-to-br from-slate-50 to-blue-50/30 overflow-hidden">
        {/* Sidebar - Chat History */}
        <div className="w-80 border-r border-slate-200 bg-white/70 backdrop-blur-sm flex flex-col">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                <BookOpen className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">ResearchAI</h1>
                <p className="text-sm text-slate-500">Academic Assistant</p>
              </div>
            </div>
            <Button
              onClick={handleNewChat}
              className="w-full justify-center gap-2 py-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium shadow-md"
              disabled={isGenerating}
            >
              <Plus className="h-5 w-5" />
              New Research Chat
            </Button>
          </div>
          
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-slate-500" />
                <h2 className="font-semibold text-slate-700">Chat History</h2>
                <Badge variant="outline" className="ml-auto bg-blue-50 text-blue-700">
                  {chatHistories.length}
                </Badge>
              </div>
            </div>
            
            <ScrollArea className="flex-1 px-3 py-2">
              <div className="space-y-3 p-2">
                {chatHistories.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <MessageSquare className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 text-sm">No chat history yet</p>
                    <p className="text-slate-400 text-xs mt-1">Start a new conversation to see it here</p>
                  </div>
                ) : (
                  chatHistories.map((history) => (
                    <Card
                      key={history.id}
                      className={`cursor-pointer transition-all duration-200 hover:shadow-md border ${
                        selectedHistoryId === history.id 
                          ? "border-blue-500 bg-blue-50/50 shadow-sm" 
                          : "border-slate-200"
                      }`}
                      onClick={() => handleLoadHistory(history.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`p-1 rounded ${selectedHistoryId === history.id ? "bg-blue-100" : "bg-slate-100"}`}>
                                <FileText className="h-3 w-3 text-slate-600" />
                              </div>
                              <p className="text-sm font-medium text-slate-800 truncate">
                                {history.title}
                              </p>
                            </div>
                            <div className="flex items-center text-xs text-slate-500">
                              <span>{history.messages.length} messages</span>
                              <span className="mx-1">•</span>
                              <span>{formatDate(history.createdAt)}</span>
                            </div>
                            {history.paperCount && (
                              <div className="flex items-center gap-1 mt-1">
                                <Search className="h-3 w-3 text-slate-400" />
                                <span className="text-xs text-slate-500">{history.paperCount} papers</span>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteHistory(history.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          
          {/* Model Status */}
          <div className="p-4 border-t border-slate-200 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Current Model:</span>
              <Badge variant={healthStatus.ollama ? "default" : "destructive"} className="text-xs">
                {currentModel}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Zap className={`h-3 w-3 ${healthStatus.ollama ? "text-green-500" : "text-red-500"}`} />
              <span>Ollama: {healthStatus.ollama ? "Connected" : "Disconnected"}</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-md">
                  <FileText className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">Research Paper Summary Generator</h1>
                  <p className="text-slate-600">Analyze and summarize academic papers with AI assistance</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {/* Model Selector */}
                <div className="bg-white/80 p-3 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium text-slate-700">AI Model:</span>
                    <select 
                      value={currentModel}
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                      disabled={isGenerating || !healthStatus.ollama}
                    >
                      {availableModels.map((model) => (
                        <option key={model.name} value={model.name}>
                          {model.name} ({model.size})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Paper Count */}
                <div className="bg-white/80 p-3 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Search className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium text-slate-700">Papers:</span>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={paperCount}
                      onChange={(e) => setPaperCount(parseInt(e.target.value) || 1)}
                      className="w-20 border-slate-300 focus:border-blue-500"
                      disabled={isGenerating}
                    />
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Quick Actions */}
          {currentChat.length === 0 && (
            <div className="border-b border-slate-200 bg-white/50 p-6">
              <div className="max-w-4xl mx-auto">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Quick Analysis Types</h3>
                <div className="grid grid-cols-4 gap-4">
                  {quickActions.map((action) => (
                    <Card 
                      key={action.id}
                      className={`cursor-pointer transition-all duration-200 hover:shadow-md border ${
                        activeQuickAction === action.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                      }`}
                      onClick={() => handleSendMessage(action.type)}
                    >
                      <CardContent className="p-4 text-center">
                        <div className={`p-2 rounded-lg w-12 h-12 mx-auto mb-3 flex items-center justify-center ${
                          activeQuickAction === action.id ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {action.icon}
                        </div>
                        <h4 className="font-medium text-slate-800 mb-1">{action.title}</h4>
                        <p className="text-xs text-slate-600">{action.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Chat Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 p-6">
              {currentChat.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-6 max-w-md">
                    <div className="p-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl w-20 h-20 mx-auto flex items-center justify-center shadow-lg">
                      <FileText className="h-10 w-10 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800 mb-2">Start a new research summary</h2>
                      <p className="text-slate-600">
                        Enter research paper topics, abstracts, or research questions below. 
                        I'll search arXiv and generate a comprehensive analysis with key findings.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-4">
                      <div className="text-center p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                        <div className="p-2 bg-blue-100 rounded-full w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                          <span className="text-blue-600 font-bold text-sm">1</span>
                        </div>
                        <p className="text-xs font-medium text-slate-700">Enter topics</p>
                      </div>
                      <div className="text-center p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                        <div className="p-2 bg-blue-100 rounded-full w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                          <span className="text-blue-600 font-bold text-sm">2</span>
                        </div>
                        <p className="text-xs font-medium text-slate-700">AI searches arXiv</p>
                      </div>
                      <div className="text-center p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                        <div className="p-2 bg-blue-100 rounded-full w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                          <span className="text-blue-600 font-bold text-sm">3</span>
                        </div>
                        <p className="text-xs font-medium text-slate-700">Get analysis</p>
                      </div>
                    </div>
                    
                    {/* Formatting Help */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Type className="h-4 w-4 text-blue-600" />
                        <h3 className="text-sm font-medium text-blue-800">Formatting Help</h3>
                      </div>
                      <div className="text-xs text-blue-700 space-y-1">
                        <p>Use <code>**bold**</code> for <strong>bold text</strong></p>
                        <p>Use <code>*italic*</code> for <em>italic text</em></p>
                        <p>Use <code>`code`</code> for <code className="inline-code">inline code</code></p>
                      </div>
                    </div>
                    
                    {!healthStatus.api && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800">
                          ⚠️ Backend server not available. Please start the FastAPI server first.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 max-w-4xl mx-auto pb-4">
                  {currentChat.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div className={`flex gap-3 max-w-[85%] ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                          message.role === "user" 
                            ? "bg-blue-500" 
                            : "bg-gradient-to-br from-purple-500 to-blue-600"
                        }`}>
                          {message.role === "user" ? (
                            <User className="h-4 w-4 text-white" />
                          ) : (
                            <Bot className="h-4 w-4 text-white" />
                          )}
                        </div>
                        <Card
                          className={`p-4 ${
                            message.role === "user"
                              ? "bg-blue-500 text-white shadow-md user-message"
                              : "bg-white border-slate-200 shadow-sm"
                          }`}
                        >
                          {renderMessageContent(message)}
                          <div className={`text-xs mt-3 ${
                            message.role === "user" ? "text-blue-100" : "text-slate-500"
                          }`}>
                            {formatDate(message.timestamp)}
                          </div>
                        </Card>
                      </div>
                    </div>
                  ))}
                  {isGenerating && (
                    <div className="flex justify-start">
                      <div className="flex gap-3 max-w-[85%]">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                        <Card className="p-4 bg-white border-slate-200 shadow-sm">
                          <div className="flex items-center gap-2 text-slate-600">
                            <div className="flex space-x-1">
                              <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce"></div>
                              <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                              <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                            </div>
                            <span className="text-sm">
                              {activeQuickAction 
                                ? `Generating ${activeQuickAction.replace('_', ' ')}...` 
                                : "Searching arXiv and generating summary..."
                              }
                            </span>
                          </div>
                        </Card>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>
          </div>

          <Separator />

          {/* Input Area */}
          <div className="p-6 bg-white/80 border-t border-slate-200 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3 items-end">
                <div className="flex-1 relative h-[70px]">
                  <Textarea
                    placeholder="Enter research paper topics, abstracts, or research questions here... You can use **bold**, *italic*, and `code` formatting."
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="min-h-[70px] resize-none border-slate-300 focus:border-blue-500 pr-12"
                    disabled={isGenerating || !healthStatus.api}
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-1">
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
                      {currentInput.length}/2000
                    </span>
                  </div>
                </div>
                <Button
                  onClick={() => handleSendMessage()}
                  disabled={!currentInput.trim() || isGenerating || !healthStatus.api}
                  className="h-[70px] px-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <div className="flex flex-col items-center gap-1">
                    <Send className="h-5 w-5" />
                    <span className="text-xs">Send</span>
                  </div>
                </Button>
              </div>

              <div className="flex justify-center mt-3">
                <p className="text-xs text-slate-500">
                  {!healthStatus.api 
                    ? "⚠️ Backend server not available. Please start the FastAPI server."
                    : "Tip: You can use **bold**, *italic*, and `code` formatting in your messages"
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}