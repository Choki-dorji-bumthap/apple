from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import requests
import xml.etree.ElementTree as ET
import ollama
import os
import logging
import asyncio
from datetime import datetime
import json
import uuid
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="arXiv Research Summarizer", version="2.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Create directories
os.makedirs("summaries", exist_ok=True)
os.makedirs("comparisons", exist_ok=True)
os.makedirs("workflows", exist_ok=True)

# Models
class SearchRequest(BaseModel):
    query: str
    max_results: int = 5
    model: str = "llama3.2:3b"

class Paper(BaseModel):
    title: str
    authors: List[str]
    summary: str
    link: str

class SearchResponse(BaseModel):
    success: bool
    papers: List[Paper]
    total_results: int
    query: str
    error: Optional[str] = None

class SummaryResponse(BaseModel):
    success: bool
    summary: str
    papers_used: int
    model: str
    query: str
    error: Optional[str] = None
    saved_path: Optional[str] = None

class ComparisonItem(BaseModel):
    paper_title: str
    research_focus: str
    methodology: str
    tools_techniques: str
    advantages: str
    limitations: str

class ComparisonResponse(BaseModel):
    success: bool
    comparison_table: List[ComparisonItem]
    comparison_text: str
    papers_compared: int
    model: str
    query: str
    error: Optional[str] = None
    saved_path: Optional[str] = None

class ModelInfo(BaseModel):
    name: str
    size: str
    description: str

class ModelsResponse(BaseModel):
    available_models: List[ModelInfo]
    current_model: str

# Automation Models
class AutomationType(str, Enum):
    LITERATURE_REVIEW = "literature_review"
    RESEARCH_GAP_ANALYSIS = "research_gap_analysis"
    METHODOLOGY_COMPARISON = "methodology_comparison"
    TREND_ANALYSIS = "trend_analysis"
    CUSTOM_WORKFLOW = "custom_workflow"

class AutomationRequest(BaseModel):
    query: str
    automation_type: AutomationType
    max_results: int = 10
    model: str = "llama3.2:3b"
    custom_instructions: Optional[str] = None
    include_summary: bool = True
    include_comparison: bool = True
    include_trends: bool = False

class AutomationResponse(BaseModel):
    success: bool
    workflow_id: str
    status: str
    results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    progress: Optional[Dict[str, Any]] = None

class WorkflowStatus(BaseModel):
    workflow_id: str
    status: str
    progress: Dict[str, Any]
    results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str
    updated_at: str

# Configuration
CUSTOM_HOST = "http://10.9.0.5:11434"
client = ollama.Client(host=CUSTOM_HOST)

# Available models configuration
AVAILABLE_MODELS = {
    "llama3.2:3b": {
        "size": "3B",
        "description": "Small text model - Fast and efficient"
    },
    "deepseek-r1:1.5b": {
        "size": "1.5B", 
        "description": "Thinking model - Good for reasoning"
    },
    "gemma3:4b": {
        "size": "4B",
        "description": "Small text and image model - Balanced"
    },
    "gemma3:270m": {
        "size": "270M",
        "description": "Very small text model - Ultra fast"
    }
}

# Automation workflows configuration
AUTOMATION_WORKFLOWS = {
    AutomationType.LITERATURE_REVIEW: {
        "name": "Literature Review",
        "description": "Comprehensive analysis of research papers including summary, comparison, and key findings",
        "steps": ["search", "summarize", "compare", "synthesize"]
    },
    AutomationType.RESEARCH_GAP_ANALYSIS: {
        "name": "Research Gap Analysis",
        "description": "Identify gaps and opportunities in current research",
        "steps": ["search", "compare", "gap_analysis"]
    },
    AutomationType.METHODOLOGY_COMPARISON: {
        "name": "Methodology Comparison", 
        "description": "Detailed comparison of research methods and approaches",
        "steps": ["search", "methodology_analysis", "compare"]
    },
    AutomationType.TREND_ANALYSIS: {
        "name": "Trend Analysis",
        "description": "Analyze research trends and emerging topics",
        "steps": ["search", "trend_analysis", "future_directions"]
    },
    AutomationType.CUSTOM_WORKFLOW: {
        "name": "Custom Workflow",
        "description": "Custom analysis based on user instructions",
        "steps": ["search", "custom_analysis"]
    }
}

class ArxivSummarizer:
    def __init__(self, client):
        self.client = client
        self.current_model = "llama3.2:3b"
        self.active_workflows = {}
    
    def check_ollama_available(self) -> bool:
        """Check if Ollama is running and available"""
        try:
            self.client.list()
            return True
        except Exception as e:
            logger.error(f"Ollama connection error: {e}")
            return False
    
    def get_available_models(self) -> List[str]:
        """Get list of available Ollama models"""
        try:
            models = self.client.list()
            return [model['name'] for model in models.get('models', [])]
        except Exception as e:
            logger.error(f"Error getting models: {e}")
            return list(AVAILABLE_MODELS.keys())
    
    def search_arxiv(self, query: str, max_results: int = 5) -> List[Paper]:
        """
        Search papers on arXiv by topic keyword.
        """
        base_url = "http://export.arxiv.org/api/query?"
        params = {
            "search_query": query,
            "start": 0,
            "max_results": max_results
        }
        
        try:
            response = requests.get(base_url, params=params, timeout=30)
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail=f"arXiv API error: {response.status_code}")

            root = ET.fromstring(response.content)
            ns = {'arxiv': 'http://www.w3.org/2005/Atom'}

            papers = []
            for entry in root.findall('arxiv:entry', ns):
                title = entry.find('arxiv:title', ns)
                summary = entry.find('arxiv:summary', ns)
                link = entry.find('arxiv:id', ns)
                
                if title is not None and summary is not None and link is not None:
                    authors = []
                    for author in entry.findall('arxiv:author', ns):
                        name = author.find('arxiv:name', ns)
                        if name is not None:
                            authors.append(name.text)
                    
                    papers.append(Paper(
                        title=title.text.strip(),
                        authors=authors,
                        summary=summary.text.strip(),
                        link=link.text
                    ))

            return papers
            
        except requests.exceptions.Timeout:
            raise HTTPException(status_code=408, detail="arXiv API request timed out")
        except Exception as e:
            logger.error(f"arXiv search error: {e}")
            raise HTTPException(status_code=500, detail=f"arXiv search failed: {str(e)}")
    
    async def summarize_with_ollama(self, papers: List[Paper], model: str = None) -> str:
        """
        Summarize retrieved arXiv papers using a local Ollama model.
        """
        if not papers:
            return "No papers found for summarization."

        if model is None:
            model = self.current_model

        # Combine paper information
        combined_text = ""
        for i, paper in enumerate(papers, 1):
            combined_text += f"=== Paper {i} ===\n"
            combined_text += f"Title: {paper.title}\n"
            combined_text += f"Authors: {', '.join(paper.authors)}\n"
            combined_text += f"Abstract: {paper.summary}\n\n"

        system_prompt = (
            "You are a research assistant specializing in summarizing academic papers. "
            "Analyze the following research paper abstracts from arXiv and provide a comprehensive summary. "
            "Focus on:\n"
            "1. Common themes and findings across the papers\n"
            "2. Key innovations and methodologies\n"
            "3. Overall implications and future directions\n"
            "4. Relationships between different papers\n\n"
            "Provide a clear, well-structured synthesis that helps researchers understand the current state of this field."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Please summarize these research papers:\n\n{combined_text}"}
        ]

        try:
            response = ollama.chat(
                model=model, 
                messages=messages,
                options={'temperature': 0.2, 'num_predict': 4000}
            )
            
            return response['message']['content'].strip()
            
        except Exception as e:
            logger.error(f"Ollama summarization error: {e}")
            raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")
    
    async def compare_papers_with_ollama(self, papers: List[Paper], model: str = None) -> Dict[str, Any]:
        """
        Compare retrieved arXiv papers and generate structured JSON comparison.
        """
        if not papers:
            return {"comparison_table": [], "comparison_text": "No papers found for comparison."}

        if model is None:
            model = self.current_model

        # Combine paper information
        combined_text = ""
        for i, paper in enumerate(papers, 1):
            combined_text += f"=== Paper {i} ===\n"
            combined_text += f"Title: {paper.title}\n"
            combined_text += f"Authors: {', '.join(paper.authors)}\n"
            combined_text += f"Abstract: {paper.summary}\n\n"

        system_prompt = (
            "You are a scientific analyst. Compare the research papers and return a JSON array where each object has:\n"
            "- paper_title: The title of the paper\n"
            "- research_focus: Main research focus/objective\n" 
            "- methodology: Research methods and approaches used\n"
            "- tools_techniques: Specific tools, algorithms, or techniques\n"
            "- advantages: Key advantages and strengths\n"
            "- limitations: Limitations and weaknesses\n\n"
            "Return ONLY valid JSON, no other text. Make the comparison concise but informative."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Compare these papers and return JSON:\n\n{combined_text}"}
        ]

        try:
            response = ollama.chat(
                model=model, 
                messages=messages,
                options={'temperature': 0.1, 'num_predict': 4000}
            )
            
            response_text = response['message']['content'].strip()
            
            # Try to extract JSON from the response
            try:
                # Look for JSON array in the response
                start_idx = response_text.find('[')
                end_idx = response_text.rfind(']') + 1
                
                if start_idx != -1 and end_idx != -1:
                    json_str = response_text[start_idx:end_idx]
                    comparison_data = json.loads(json_str)
                    
                    # Validate the structure
                    if isinstance(comparison_data, list):
                        validated_data = []
                        for item in comparison_data:
                            if isinstance(item, dict):
                                validated_item = {
                                    "paper_title": item.get("paper_title", "N/A"),
                                    "research_focus": item.get("research_focus", "N/A"),
                                    "methodology": item.get("methodology", "N/A"),
                                    "tools_techniques": item.get("tools_techniques", "N/A"),
                                    "advantages": item.get("advantages", "N/A"),
                                    "limitations": item.get("limitations", "N/A")
                                }
                                validated_data.append(validated_item)
                        
                        return {
                            "comparison_table": validated_data,
                            "comparison_text": "Comparison generated successfully."
                        }
                
                # If JSON parsing fails, return structured data manually
                return self._create_manual_comparison(papers, response_text)
                
            except json.JSONDecodeError as e:
                logger.warning(f"JSON parsing failed, creating manual comparison: {e}")
                return self._create_manual_comparison(papers, response_text)
            
        except Exception as e:
            logger.error(f"Ollama comparison error: {e}")
            raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")
    
    def _create_manual_comparison(self, papers: List[Paper], response_text: str) -> Dict[str, Any]:
        """Create a structured comparison when JSON parsing fails"""
        comparison_table = []
        
        for paper in papers:
            comparison_table.append({
                "paper_title": paper.title,
                "research_focus": "Extracted from analysis",
                "methodology": "Based on paper content", 
                "tools_techniques": "Detailed in research",
                "advantages": "Key strengths identified",
                "limitations": "Areas for improvement"
            })
        
        return {
            "comparison_table": comparison_table,
            "comparison_text": response_text
        }

    async def analyze_research_gaps(self, papers: List[Paper], model: str = None) -> str:
        """Analyze research gaps in the papers"""
        if not papers:
            return "No papers found for gap analysis."

        if model is None:
            model = self.current_model

        combined_text = ""
        for i, paper in enumerate(papers, 1):
            combined_text += f"=== Paper {i} ===\n"
            combined_text += f"Title: {paper.title}\n"
            combined_text += f"Abstract: {paper.summary}\n\n"

        system_prompt = (
            "You are a research analyst specializing in identifying research gaps. "
            "Analyze the following papers and identify:\n"
            "1. Unexplored research questions\n"
            "2. Methodological limitations\n"
            "3. Contradictory findings\n"
            "4. Emerging opportunities\n"
            "5. Future research directions\n\n"
            "Provide a structured analysis of research gaps and opportunities."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Identify research gaps in these papers:\n\n{combined_text}"}
        ]

        try:
            response = ollama.chat(
                model=model, 
                messages=messages,
                options={'temperature': 0.3, 'num_predict': 3000}
            )
            return response['message']['content'].strip()
        except Exception as e:
            logger.error(f"Gap analysis error: {e}")
            return f"Gap analysis failed: {str(e)}"

    async def analyze_trends(self, papers: List[Paper], model: str = None) -> str:
        """Analyze research trends in the papers"""
        if not papers:
            return "No papers found for trend analysis."

        if model is None:
            model = self.current_model

        combined_text = ""
        for i, paper in enumerate(papers, 1):
            combined_text += f"=== Paper {i} ===\n"
            combined_text += f"Title: {paper.title}\n"
            combined_text += f"Abstract: {paper.summary}\n\n"

        system_prompt = (
            "You are a research trend analyst. Analyze the following papers and identify:\n"
            "1. Emerging research themes\n"
            "2. Evolution of methodologies\n"
            "3. Collaborative patterns\n"
            "4. Impactful contributions\n"
            "5. Future trajectory predictions\n\n"
            "Provide insights about research trends and their implications."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyze research trends in these papers:\n\n{combined_text}"}
        ]

        try:
            response = ollama.chat(
                model=model, 
                messages=messages,
                options={'temperature': 0.3, 'num_predict': 3000}
            )
            return response['message']['content'].strip()
        except Exception as e:
            logger.error(f"Trend analysis error: {e}")
            return f"Trend analysis failed: {str(e)}"

    async def execute_automation_workflow(self, request: AutomationRequest, workflow_id: str):
        """Execute automation workflow in background"""
        try:
            # Initialize workflow status
            self.active_workflows[workflow_id] = {
                "status": "running",
                "progress": {"current_step": 0, "total_steps": 0, "step_name": "Initializing"},
                "results": {},
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }

            # Search for papers
            self._update_workflow_progress(workflow_id, "Searching arXiv", 1, 5)
            papers = self.search_arxiv(request.query, request.max_results)
            
            if not papers:
                self.active_workflows[workflow_id].update({
                    "status": "completed",
                    "error": "No papers found for the given query"
                })
                return

            results = {
                "papers_found": len(papers),
                "papers": [paper.dict() for paper in papers],
                "workflow_type": request.automation_type.value
            }

            # Execute workflow based on type
            if request.automation_type == AutomationType.LITERATURE_REVIEW:
                await self._execute_literature_review(workflow_id, papers, request, results)
            elif request.automation_type == AutomationType.RESEARCH_GAP_ANALYSIS:
                await self._execute_gap_analysis(workflow_id, papers, request, results)
            elif request.automation_type == AutomationType.METHODOLOGY_COMPARISON:
                await self._execute_methodology_comparison(workflow_id, papers, request, results)
            elif request.automation_type == AutomationType.TREND_ANALYSIS:
                await self._execute_trend_analysis(workflow_id, papers, request, results)
            elif request.automation_type == AutomationType.CUSTOM_WORKFLOW:
                await self._execute_custom_workflow(workflow_id, papers, request, results)

            # Save workflow results
            self._save_workflow_results(workflow_id, request.query, results)
            
            self.active_workflows[workflow_id].update({
                "status": "completed",
                "results": results,
                "updated_at": datetime.now().isoformat()
            })

        except Exception as e:
            logger.error(f"Workflow execution error: {e}")
            self.active_workflows[workflow_id].update({
                "status": "failed",
                "error": str(e),
                "updated_at": datetime.now().isoformat()
            })

    async def _execute_literature_review(self, workflow_id: str, papers: List[Paper], request: AutomationRequest, results: Dict):
        """Execute literature review workflow"""
        self._update_workflow_progress(workflow_id, "Generating Summary", 2, 5)
        summary = await self.summarize_with_ollama(papers, request.model)
        results["summary"] = summary

        self._update_workflow_progress(workflow_id, "Comparing Papers", 3, 5)
        comparison = await self.compare_papers_with_ollama(papers, request.model)
        results["comparison"] = comparison

        self._update_workflow_progress(workflow_id, "Analyzing Gaps", 4, 5)
        gap_analysis = await self.analyze_research_gaps(papers, request.model)
        results["gap_analysis"] = gap_analysis

        self._update_workflow_progress(workflow_id, "Finalizing", 5, 5)
        # Add synthesis
        results["key_findings"] = self._extract_key_findings(summary, gap_analysis)

    async def _execute_gap_analysis(self, workflow_id: str, papers: List[Paper], request: AutomationRequest, results: Dict):
        """Execute research gap analysis workflow"""
        self._update_workflow_progress(workflow_id, "Comparing Papers", 2, 4)
        comparison = await self.compare_papers_with_ollama(papers, request.model)
        results["comparison"] = comparison

        self._update_workflow_progress(workflow_id, "Analyzing Gaps", 3, 4)
        gap_analysis = await self.analyze_research_gaps(papers, request.model)
        results["gap_analysis"] = gap_analysis

        self._update_workflow_progress(workflow_id, "Generating Recommendations", 4, 4)
        results["recommendations"] = self._generate_recommendations(gap_analysis)

    async def _execute_methodology_comparison(self, workflow_id: str, papers: List[Paper], request: AutomationRequest, results: Dict):
        """Execute methodology comparison workflow"""
        self._update_workflow_progress(workflow_id, "Detailed Comparison", 2, 3)
        comparison = await self.compare_papers_with_ollama(papers, request.model)
        results["comparison"] = comparison

        self._update_workflow_progress(workflow_id, "Methodology Analysis", 3, 3)
        results["methodology_insights"] = self._extract_methodology_insights(comparison)

    async def _execute_trend_analysis(self, workflow_id: str, papers: List[Paper], request: AutomationRequest, results: Dict):
        """Execute trend analysis workflow"""
        self._update_workflow_progress(workflow_id, "Trend Analysis", 2, 3)
        trend_analysis = await self.analyze_trends(papers, request.model)
        results["trend_analysis"] = trend_analysis

        self._update_workflow_progress(workflow_id, "Future Directions", 3, 3)
        results["future_directions"] = self._extract_future_directions(trend_analysis)

    async def _execute_custom_workflow(self, workflow_id: str, papers: List[Paper], request: AutomationRequest, results: Dict):
        """Execute custom workflow"""
        if request.custom_instructions:
            self._update_workflow_progress(workflow_id, "Custom Analysis", 2, 3)
            custom_analysis = await self._perform_custom_analysis(papers, request.custom_instructions, request.model)
            results["custom_analysis"] = custom_analysis

    async def _perform_custom_analysis(self, papers: List[Paper], instructions: str, model: str) -> str:
        """Perform custom analysis based on user instructions"""
        combined_text = ""
        for i, paper in enumerate(papers, 1):
            combined_text += f"=== Paper {i} ===\n"
            combined_text += f"Title: {paper.title}\n"
            combined_text += f"Abstract: {paper.summary}\n\n"

        system_prompt = f"You are a research analyst. Follow these instructions: {instructions}"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyze these papers according to the instructions:\n\n{combined_text}"}
        ]

        try:
            response = ollama.chat(model=model, messages=messages, options={'temperature': 0.3, 'num_predict': 4000})
            return response['message']['content'].strip()
        except Exception as e:
            return f"Custom analysis failed: {str(e)}"

    def _update_workflow_progress(self, workflow_id: str, step_name: str, current: int, total: int):
        """Update workflow progress"""
        if workflow_id in self.active_workflows:
            self.active_workflows[workflow_id]["progress"] = {
                "current_step": current,
                "total_steps": total,
                "step_name": step_name
            }
            self.active_workflows[workflow_id]["updated_at"] = datetime.now().isoformat()

    def _extract_key_findings(self, summary: str, gap_analysis: str) -> str:
        """Extract key findings from summary and gap analysis"""
        return f"Key findings synthesized from analysis:\n\nSummary Highlights:\n{summary[:500]}...\n\nGap Analysis Insights:\n{gap_analysis[:500]}..."

    def _generate_recommendations(self, gap_analysis: str) -> str:
        """Generate research recommendations from gap analysis"""
        return f"Research recommendations based on identified gaps:\n\n{gap_analysis}"

    def _extract_methodology_insights(self, comparison: Dict) -> str:
        """Extract methodology insights from comparison"""
        insights = "Methodology Insights:\n\n"
        if "comparison_table" in comparison:
            for item in comparison["comparison_table"]:
                insights += f"- {item.get('paper_title', 'Unknown')}: {item.get('methodology', 'N/A')}\n"
        return insights

    def _extract_future_directions(self, trend_analysis: str) -> str:
        """Extract future directions from trend analysis"""
        return f"Future research directions based on trends:\n\n{trend_analysis}"

    def _save_workflow_results(self, workflow_id: str, query: str, results: Dict):
        """Save workflow results to file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"workflows/{query.replace(' ', '_')}_{timestamp}_{workflow_id}.json"
        
        try:
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(results, f, indent=2)
            return filename
        except Exception as e:
            logger.error(f"Error saving workflow results: {e}")
            return None

    def save_summary(self, topic: str, summary_text: str) -> str:
        """Save the generated summary to a file for later use."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"summaries/{topic.replace(' ', '_')}_{timestamp}_summary.txt"
        
        try:
            with open(filename, "w", encoding="utf-8") as f:
                f.write(summary_text)
            return filename
        except Exception as e:
            logger.error(f"Error saving summary: {e}")
            return None

    def save_comparison(self, topic: str, comparison_data: Dict[str, Any]) -> str:
        """Save the generated comparison to a file for later use."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"comparisons/{topic.replace(' ', '_')}_{timestamp}_comparison.json"
        
        try:
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(comparison_data, f, indent=2)
            return filename
        except Exception as e:
            logger.error(f"Error saving comparison: {e}")
            return None

# Initialize the summarizer
summarizer = ArxivSummarizer(client)

# Existing endpoints (keep all your existing endpoints as they are)
@app.get("/")
async def read_index():
    return FileResponse('static/index.html')

@app.get("/api/health")
async def health_check():
    """Check if Ollama and arXiv are available"""
    ollama_available = summarizer.check_ollama_available()
    available_models = summarizer.get_available_models()
    
    return {
        "status": "healthy",
        "ollama_available": ollama_available,
        "available_models": available_models,
        "current_model": summarizer.current_model,
        "host": CUSTOM_HOST
    }

@app.get("/api/models")
async def get_models():
    """Get available models with descriptions"""
    available_models = summarizer.get_available_models()
    
    models_info = []
    for model_name in available_models:
        if model_name in AVAILABLE_MODELS:
            info = AVAILABLE_MODELS[model_name]
            models_info.append(ModelInfo(
                name=model_name,
                size=info["size"],
                description=info["description"]
            ))
        else:
            models_info.append(ModelInfo(
                name=model_name,
                size="Unknown",
                description="Custom model"
            ))
    
    return ModelsResponse(
        available_models=models_info,
        current_model=summarizer.current_model
    )

@app.post("/api/search", response_model=SearchResponse)
async def search_papers(request: SearchRequest):
    """Search arXiv for papers on a given topic"""
    try:
        logger.info(f"Searching arXiv for: {request.query}")
        
        papers = summarizer.search_arxiv(request.query, request.max_results)
        
        return SearchResponse(
            success=True,
            papers=papers,
            total_results=len(papers),
            query=request.query
        )
        
    except HTTPException as e:
        return SearchResponse(
            success=False,
            papers=[],
            total_results=0,
            query=request.query,
            error=e.detail
        )
    except Exception as e:
        logger.error(f"Search error: {e}")
        return SearchResponse(
            success=False,
            papers=[],
            total_results=0,
            query=request.query,
            error=str(e)
        )

@app.post("/api/summarize", response_model=SummaryResponse)
async def summarize_papers(request: SearchRequest):
    """Search and summarize arXiv papers"""
    try:
        logger.info(f"Summarizing papers for: {request.query} using model: {request.model}")
        
        # Search for papers
        papers = summarizer.search_arxiv(request.query, request.max_results)
        
        if not papers:
            return SummaryResponse(
                success=False,
                summary="",
                papers_used=0,
                model=request.model,
                query=request.query,
                error="No papers found for the given query"
            )
        
        # Summarize papers
        summary = await summarizer.summarize_with_ollama(papers, request.model)
        
        # Save summary
        saved_path = summarizer.save_summary(request.query, summary)
        
        return SummaryResponse(
            success=True,
            summary=summary,
            papers_used=len(papers),
            model=request.model,
            query=request.query,
            saved_path=saved_path
        )
        
    except HTTPException as e:
        return SummaryResponse(
            success=False,
            summary="",
            papers_used=0,
            model=request.model,
            query=request.query,
            error=e.detail
        )
    except Exception as e:
        logger.error(f"Summarization error: {e}")
        return SummaryResponse(
            success=False,
            summary="",
            papers_used=0,
            model=request.model,
            query=request.query,
            error=str(e)
        )

@app.post("/api/compare", response_model=ComparisonResponse)
async def compare_papers(request: SearchRequest):
    """Search and compare arXiv papers - returns structured JSON for table display"""
    try:
        logger.info(f"Comparing papers for: {request.query} using model: {request.model}")
        
        # Search for papers
        papers = summarizer.search_arxiv(request.query, request.max_results)
        
        if not papers:
            return ComparisonResponse(
                success=False,
                comparison_table=[],
                comparison_text="",
                papers_compared=0,
                model=request.model,
                query=request.query,
                error="No papers found for the given query"
            )
        
        # Compare papers and get structured data
        comparison_result = await summarizer.compare_papers_with_ollama(papers, request.model)
        
        # Save comparison
        saved_path = summarizer.save_comparison(request.query, comparison_result)
        
        return ComparisonResponse(
            success=True,
            comparison_table=comparison_result["comparison_table"],
            comparison_text=comparison_result["comparison_text"],
            papers_compared=len(papers),
            model=request.model,
            query=request.query,
            saved_path=saved_path
        )
        
    except HTTPException as e:
        return ComparisonResponse(
            success=False,
            comparison_table=[],
            comparison_text="",
            papers_compared=0,
            model=request.model,
            query=request.query,
            error=e.detail
        )
    except Exception as e:
        logger.error(f"Comparison error: {e}")
        return ComparisonResponse(
            success=False,
            comparison_table=[],
            comparison_text="",
            papers_compared=0,
            model=request.model,
            query=request.query,
            error=str(e)
        )

# NEW AUTOMATION ENDPOINTS
@app.get("/api/automation/workflows")
async def get_automation_workflows():
    """Get available automation workflows"""
    return {
        "success": True,
        "workflows": AUTOMATION_WORKFLOWS
    }

@app.post("/api/automation/execute", response_model=AutomationResponse)
async def execute_automation_workflow(request: AutomationRequest, background_tasks: BackgroundTasks):
    """Execute an automation workflow"""
    try:
        # Generate unique workflow ID
        workflow_id = str(uuid.uuid4())[:8]
        
        # Start workflow in background
        background_tasks.add_task(
            summarizer.execute_automation_workflow, 
            request, 
            workflow_id
        )
        
        return AutomationResponse(
            success=True,
            workflow_id=workflow_id,
            status="started",
            progress={"current_step": 0, "total_steps": 0, "step_name": "Initializing"}
        )
        
    except Exception as e:
        logger.error(f"Automation execution error: {e}")
        return AutomationResponse(
            success=False,
            workflow_id="",
            status="failed",
            error=str(e)
        )

@app.get("/api/automation/status/{workflow_id}")
async def get_workflow_status(workflow_id: str):
    """Get status of a workflow"""
    if workflow_id not in summarizer.active_workflows:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    workflow_data = summarizer.active_workflows[workflow_id]
    return WorkflowStatus(
        workflow_id=workflow_id,
        status=workflow_data["status"],
        progress=workflow_data["progress"],
        results=workflow_data.get("results"),
        error=workflow_data.get("error"),
        created_at=workflow_data["created_at"],
        updated_at=workflow_data["updated_at"]
    )

@app.get("/api/automation/results")
async def get_saved_workflows():
    """Get list of saved workflow results"""
    try:
        workflows = []
        for filename in os.listdir("workflows"):
            if filename.endswith(".json"):
                file_path = os.path.join("workflows", filename)
                stats = os.stat(file_path)
                workflows.append({
                    "filename": filename,
                    "path": file_path,
                    "created": datetime.fromtimestamp(stats.st_ctime).isoformat(),
                    "size": stats.st_size
                })
        
        # Sort by creation time (newest first)
        workflows.sort(key=lambda x: x["created"], reverse=True)
        return {"success": True, "workflows": workflows}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/automation/results/{filename}")
async def get_workflow_result(filename: str):
    """Get a specific workflow result file"""
    try:
        file_path = os.path.join("workflows", filename)
        if os.path.exists(file_path) and filename.endswith(".json"):
            with open(file_path, "r", encoding="utf-8") as f:
                workflow_data = json.load(f)
            return JSONResponse(content=workflow_data)
        else:
            raise HTTPException(status_code=404, detail="Workflow file not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading workflow file: {str(e)}")

# Keep existing endpoints
@app.post("/api/set-model")
async def set_model(model: str):
    """Change the current model"""
    try:
        available_models = summarizer.get_available_models()
        if model not in available_models:
            return {"success": False, "error": f"Model {model} not available"}
        
        summarizer.current_model = model
        return {"success": True, "message": f"Model changed to {model}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/saved-summaries")
async def get_saved_summaries():
    """Get list of saved summaries"""
    try:
        summaries = []
        for filename in os.listdir("summaries"):
            if filename.endswith("_summary.txt"):
                file_path = os.path.join("summaries", filename)
                stats = os.stat(file_path)
                summaries.append({
                    "filename": filename,
                    "path": file_path,
                    "created": datetime.fromtimestamp(stats.st_ctime).isoformat(),
                    "size": stats.st_size
                })
        
        # Sort by creation time (newest first)
        summaries.sort(key=lambda x: x["created"], reverse=True)
        return {"success": True, "summaries": summaries}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/saved-comparisons")
async def get_saved_comparisons():
    """Get list of saved comparisons"""
    try:
        comparisons = []
        for filename in os.listdir("comparisons"):
            if filename.endswith("_comparison.json"):
                file_path = os.path.join("comparisons", filename)
                stats = os.stat(file_path)
                comparisons.append({
                    "filename": filename,
                    "path": file_path,
                    "created": datetime.fromtimestamp(stats.st_ctime).isoformat(),
                    "size": stats.st_size
                })
        
        # Sort by creation time (newest first)
        comparisons.sort(key=lambda x: x["created"], reverse=True)
        return {"success": True, "comparisons": comparisons}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/comparison/{filename}")
async def get_comparison_file(filename: str):
    """Get a specific comparison file"""
    try:
        file_path = os.path.join("comparisons", filename)
        if os.path.exists(file_path) and filename.endswith("_comparison.json"):
            with open(file_path, "r", encoding="utf-8") as f:
                comparison_data = json.load(f)
            return JSONResponse(content=comparison_data)
        else:
            raise HTTPException(status_code=404, detail="Comparison file not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading comparison file: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)