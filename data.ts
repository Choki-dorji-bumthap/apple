// API Service for Research Summary Generator
export interface Paper {
  title: string;
  authors: string[];
  summary: string;
  link: string;
}

export interface SearchResponse {
  success: boolean;
  papers: Paper[];
  total_results: number;
  query: string;
  error?: string;
}

export interface SummaryResponse {
  success: boolean;
  summary: string;
  papers_used: number;
  model: string;
  query: string;
  error?: string;
  saved_path?: string;
}

export interface ComparisonResponse {
  success: boolean;
  comparison_table: ComparisonItem[];
  comparison_text: string;
  papers_compared: number;
  model: string;
  query: string;
  error?: string;
  saved_path?: string;
}

export interface ComparisonItem {
  paper_title: string;
  research_focus: string;
  methodology: string;
  tools_techniques: string;
  advantages: string;
  limitations: string;
}

export interface ModelInfo {
  name: string;
  size: string;
  description: string;
}

export interface ModelsResponse {
  available_models: ModelInfo[];
  current_model: string;
}

export interface HealthResponse {
  status: string;
  ollama_available: boolean;
  available_models: string[];
  current_model: string;
  host: string;
}

export interface AutomationRequest {
  query: string;
  automation_type: string;
  max_results?: number;
  model?: string;
  custom_instructions?: string;
}

export interface AutomationResponse {
  success: boolean;
  workflow_id: string;
  status: string;
  results?: any;
  error?: string;
  progress?: any;
}

export interface ToolResponse {
  success: boolean;
  data?: any;
  message: string;
  tool_name: string;
  execution_time?: number;
}

class ApiService {
  private baseUrl: string;

  constructor() {
    // Use environment variable or default to local development server
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  }

  private async fetchWithErrorHandling(endpoint: string, options: RequestInit = {}) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API call failed for ${endpoint}:`, error);
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<HealthResponse> {
    return this.fetchWithErrorHandling('/api/health');
  }

  // Model management
  async getModels(): Promise<ModelsResponse> {
    return this.fetchWithErrorHandling('/api/models');
  }

  async setModel(model: string): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.fetchWithErrorHandling('/api/set-model', {
      method: 'POST',
      body: JSON.stringify({ model }),
    });
  }

  // Paper operations
  async searchPapers(query: string, maxResults: number = 5, model?: string): Promise<SearchResponse> {
    return this.fetchWithErrorHandling('/api/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        max_results: maxResults,
        model: model || 'llama3.2:3b',
      }),
    });
  }

  async summarizePapers(query: string, maxResults: number = 5, model?: string): Promise<SummaryResponse> {
    return this.fetchWithErrorHandling('/api/summarize', {
      method: 'POST',
      body: JSON.stringify({
        query,
        max_results: maxResults,
        model: model || 'llama3.2:3b',
      }),
    });
  }

  async comparePapers(query: string, maxResults: number = 5, model?: string): Promise<ComparisonResponse> {
    return this.fetchWithErrorHandling('/api/compare', {
      method: 'POST',
      body: JSON.stringify({
        query,
        max_results: maxResults,
        model: model || 'llama3.2:3b',
      }),
    });
  }

  // Automation workflows
  async executeAutomation(request: AutomationRequest): Promise<AutomationResponse> {
    return this.fetchWithErrorHandling('/api/automation/execute', {
      method: 'POST',
      body: JSON.stringify({
        query: request.query,
        automation_type: request.automation_type,
        max_results: request.max_results || 10,
        model: request.model || 'llama3.2:3b',
        custom_instructions: request.custom_instructions,
      }),
    });
  }

  async getWorkflowStatus(workflowId: string): Promise<any> {
    return this.fetchWithErrorHandling(`/api/automation/status/${workflowId}`);
  }

  // Tools
  async listTools(): Promise<{ success: boolean; tools: any[] }> {
    return this.fetchWithErrorHandling('/api/tools');
  }

  async executeTool(toolName: string, parameters: any): Promise<ToolResponse> {
    return this.fetchWithErrorHandling(`/api/tools/${toolName}`, {
      method: 'POST',
      body: JSON.stringify(parameters),
    });
  }

  // Saved items
  async getSavedSummaries(): Promise<{ success: boolean; summaries: any[]; error?: string }> {
    return this.fetchWithErrorHandling('/api/saved-summaries');
  }

  async getSavedComparisons(): Promise<{ success: boolean; comparisons: any[]; error?: string }> {
    return this.fetchWithErrorHandling('/api/saved-comparisons');
  }

  async getSavedWorkflows(): Promise<{ success: boolean; workflows: any[]; error?: string }> {
    return this.fetchWithErrorHandling('/api/automation/results');
  }

  // Batch operations
  async batchAnalyze(
    query: string, 
    analyses: string[], 
    maxResults: number = 10, 
    model?: string
  ): Promise<any> {
    return this.executeTool('batch_analyze', {
      query,
      analyses,
      max_results: maxResults,
      model: model || 'llama3.2:3b',
    });
  }

  // Quick analysis methods
  async quickLiteratureReview(query: string, maxResults: number = 10, model?: string): Promise<any> {
    return this.executeAutomation({
      query,
      automation_type: 'literature_review',
      max_results: maxResults,
      model: model || 'llama3.2:3b',
    });
  }

  async quickGapAnalysis(query: string, maxResults: number = 10, model?: string): Promise<any> {
    return this.executeAutomation({
      query,
      automation_type: 'research_gap_analysis',
      max_results: maxResults,
      model: model || 'llama3.2:3b',
    });
  }

  async quickTrendAnalysis(query: string, maxResults: number = 10, model?: string): Promise<any> {
    return this.executeAutomation({
      query,
      automation_type: 'trend_analysis',
      max_results: maxResults,
      model: model || 'llama3.2:3b',
    });
  }
}

// Export singleton instance
export const apiService = new ApiService();