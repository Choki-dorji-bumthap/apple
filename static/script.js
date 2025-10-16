class ArxivSummarizer {
    constructor() {
        this.baseUrl = window.location.origin;
        this.currentWorkflowId = null;
        this.workflowCheckInterval = null;
        this.availableTools = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkHealth();
        this.loadModels();
        this.loadTools();
        this.loadSavedItems();
    }

    bindEvents() {
        // Search and action buttons
        document.getElementById('search-btn').addEventListener('click', () => this.searchPapers());
        document.getElementById('summarize-btn').addEventListener('click', () => this.summarizePapers());
        document.getElementById('compare-btn').addEventListener('click', () => this.comparePapers());
        
        // Model selection
        document.getElementById('model-select').addEventListener('change', (e) => this.setModel(e.target.value));
        
        // Automation buttons
        document.querySelectorAll('.run-automation').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('.automation-card');
                const type = card.dataset.type;
                this.runAutomation(type);
            });
        });
        
        document.getElementById('run-custom').addEventListener('click', () => this.runCustomAutomation());
        
        // Tool buttons
        document.getElementById('run-tool').addEventListener('click', () => this.executeTool());
        
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        // Result controls
        document.getElementById('clear-results').addEventListener('click', () => this.clearResults());
        document.getElementById('export-results').addEventListener('click', () => this.exportResults());
        
        // Progress close
        document.getElementById('progress-close').addEventListener('click', () => this.hideProgress());
        
        // Enter key for search
        document.getElementById('search-query').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchPapers();
        });
        
        // Tool selection
        document.getElementById('tool-select').addEventListener('change', (e) => this.updateToolParameters(e.target.value));
    }

    async checkHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`);
            const data = await response.json();
            
            this.updateStatus('ollama-status', data.ollama_available ? 'online' : 'offline');
            document.getElementById('current-model').textContent = `Current: ${data.current_model}`;
            
        } catch (error) {
            console.error('Health check failed:', error);
            this.updateStatus('ollama-status', 'offline');
        }
    }

    updateStatus(elementId, status) {
        const element = document.getElementById(elementId);
        element.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        element.className = `status ${status}`;
    }

    async loadModels() {
        try {
            const response = await fetch(`${this.baseUrl}/api/models`);
            const data = await response.json();
            
            const select = document.getElementById('model-select');
            select.innerHTML = '';
            
            data.available_models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = `${model.name} (${model.size}) - ${model.description}`;
                select.appendChild(option);
            });
            
            // Select current model
            select.value = data.current_model;
            this.updateModelInfo(data.current_model, data.available_models);
            
        } catch (error) {
            console.error('Failed to load models:', error);
        }
    }

    async loadTools() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tools`);
            const data = await response.json();
            
            if (data.success) {
                this.availableTools = data.tools;
                this.populateToolSelector();
            }
        } catch (error) {
            console.error('Failed to load tools:', error);
        }
    }

    populateToolSelector() {
        const select = document.getElementById('tool-select');
        select.innerHTML = '<option value="">Select a tool...</option>';
        
        // Group tools by category
        const toolsByCategory = {};
        this.availableTools.forEach(tool => {
            if (!toolsByCategory[tool.category]) {
                toolsByCategory[tool.category] = [];
            }
            toolsByCategory[tool.category].push(tool);
        });
        
        // Populate dropdown with categories
        Object.keys(toolsByCategory).forEach(category => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = category.toUpperCase();
            
            toolsByCategory[category].forEach(tool => {
                const option = document.createElement('option');
                option.value = tool.name;
                option.textContent = `${tool.name} - ${tool.description}`;
                optgroup.appendChild(option);
            });
            
            select.appendChild(optgroup);
        });
    }

    updateToolParameters(toolName) {
        const paramsContainer = document.getElementById('tool-parameters');
        paramsContainer.innerHTML = '';
        
        if (!toolName) return;
        
        const tool = this.availableTools.find(t => t.name === toolName);
        if (!tool) return;
        
        // Common parameters
        const commonParams = `
            <div class="parameter-group">
                <label for="tool-query">Research Query:</label>
                <input type="text" id="tool-query" class="parameter-input" placeholder="Enter research topic" value="${document.getElementById('search-query').value}">
            </div>
            <div class="parameter-group">
                <label for="tool-max-results">Max Results:</label>
                <select id="tool-max-results" class="parameter-select">
                    <option value="3">3 papers</option>
                    <option value="5" selected>5 papers</option>
                    <option value="10">10 papers</option>
                    <option value="15">15 papers</option>
                </select>
            </div>
            <div class="parameter-group">
                <label for="tool-model">Model:</label>
                <select id="tool-model" class="parameter-select">
                    ${document.getElementById('model-select').innerHTML}
                </select>
            </div>
        `;
        
        paramsContainer.innerHTML = commonParams;
        
        // Tool-specific parameters
        if (toolName === 'batch_analyze') {
            paramsContainer.innerHTML += `
                <div class="parameter-group">
                    <label>Analyses to Run:</label>
                    <div class="checkbox-group">
                        <label><input type="checkbox" name="analyses" value="summary" checked> Summary</label>
                        <label><input type="checkbox" name="analyses" value="comparison" checked> Comparison</label>
                        <label><input type="checkbox" name="analyses" value="gap_analysis"> Gap Analysis</label>
                        <label><input type="checkbox" name="analyses" value="trend_analysis"> Trend Analysis</label>
                    </div>
                </div>
            `;
        } else if (toolName === 'execute_workflow') {
            paramsContainer.innerHTML += `
                <div class="parameter-group">
                    <label for="workflow-type">Workflow Type:</label>
                    <select id="workflow-type" class="parameter-select">
                        <option value="literature_review">Literature Review</option>
                        <option value="research_gap_analysis">Research Gap Analysis</option>
                        <option value="methodology_comparison">Methodology Comparison</option>
                        <option value="trend_analysis">Trend Analysis</option>
                        <option value="custom_workflow">Custom Workflow</option>
                    </select>
                </div>
                <div class="parameter-group">
                    <label for="custom-instructions-tool">Custom Instructions (optional):</label>
                    <textarea id="custom-instructions-tool" class="parameter-textarea" placeholder="Enter custom instructions for workflow..."></textarea>
                </div>
            `;
        }
        
        // Set current model
        document.getElementById('tool-model').value = document.getElementById('model-select').value;
    }

    updateModelInfo(modelName, models) {
        const model = models.find(m => m.name === modelName);
        const infoElement = document.getElementById('model-info');
        
        if (model) {
            infoElement.innerHTML = `
                <h4>${model.name}</h4>
                <p><strong>Size:</strong> ${model.size}</p>
                <p><strong>Description:</strong> ${model.description}</p>
            `;
        }
    }

    async setModel(modelName) {
        try {
            const response = await fetch(`${this.baseUrl}/api/set-model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName })
            });
            
            const data = await response.json();
            if (data.success) {
                this.showNotification(`Model changed to ${modelName}`, 'success');
                this.loadModels(); // Reload to update current model display
            } else {
                this.showNotification(`Failed to change model: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Failed to set model:', error);
            this.showNotification('Failed to change model', 'error');
        }
    }

    async searchPapers() {
        const query = document.getElementById('search-query').value.trim();
        const maxResults = document.getElementById('max-results').value;
        
        if (!query) {
            this.showNotification('Please enter a search query', 'warning');
            return;
        }

        this.showProgress('Searching arXiv...', 0, 1);
        
        try {
            const response = await fetch(`${this.baseUrl}/api/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    max_results: parseInt(maxResults)
                })
            });
            
            const data = await response.json();
            this.hideProgress();
            
            if (data.success) {
                this.displayPapers(data.papers);
                this.switchTab('papers');
                this.showNotification(`Found ${data.total_results} papers`, 'success');
            } else {
                this.showNotification(`Search failed: ${data.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Search failed:', error);
            this.hideProgress();
            this.showNotification('Search failed. Please try again.', 'error');
        }
    }

    async summarizePapers() {
        const query = document.getElementById('search-query').value.trim();
        const maxResults = document.getElementById('max-results').value;
        const model = document.getElementById('model-select').value;
        
        if (!query) {
            this.showNotification('Please enter a search query', 'warning');
            return;
        }

        this.showProgress('Generating summary...', 0, 2);
        
        try {
            // First search for papers
            this.updateProgress('Searching papers...', 1, 2);
            const searchResponse = await fetch(`${this.baseUrl}/api/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    max_results: parseInt(maxResults)
                })
            });
            
            const searchData = await searchResponse.json();
            
            if (!searchData.success) {
                throw new Error(searchData.error || 'Search failed');
            }

            // Then generate summary
            this.updateProgress('Generating AI summary...', 2, 2);
            const summaryResponse = await fetch(`${this.baseUrl}/api/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    max_results: parseInt(maxResults),
                    model: model
                })
            });
            
            const summaryData = await summaryResponse.json();
            this.hideProgress();
            
            if (summaryData.success) {
                this.displaySummary(summaryData);
                this.switchTab('summary');
                this.showNotification(`Summary generated using ${summaryData.papers_used} papers`, 'success');
            } else {
                this.showNotification(`Summarization failed: ${summaryData.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Summarization failed:', error);
            this.hideProgress();
            this.showNotification('Summarization failed. Please try again.', 'error');
        }
    }

    async comparePapers() {
        const query = document.getElementById('search-query').value.trim();
        const maxResults = document.getElementById('max-results').value;
        const model = document.getElementById('model-select').value;
        
        if (!query) {
            this.showNotification('Please enter a search query', 'warning');
            return;
        }

        this.showProgress('Generating comparison...', 0, 2);
        
        try {
            this.updateProgress('Searching papers...', 1, 2);
            const response = await fetch(`${this.baseUrl}/api/compare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    max_results: parseInt(maxResults),
                    model: model
                })
            });
            
            const data = await response.json();
            this.hideProgress();
            
            if (data.success) {
                this.displayComparison(data);
                this.switchTab('comparison');
                this.showNotification(`Comparison generated for ${data.papers_compared} papers`, 'success');
            } else {
                this.showNotification(`Comparison failed: ${data.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Comparison failed:', error);
            this.hideProgress();
            this.showNotification('Comparison failed. Please try again.', 'error');
        }
    }

    async executeTool() {
        const toolName = document.getElementById('tool-select').value;
        
        if (!toolName) {
            this.showNotification('Please select a tool', 'warning');
            return;
        }

        const query = document.getElementById('tool-query').value.trim();
        if (!query) {
            this.showNotification('Please enter a research query', 'warning');
            return;
        }

        this.showProgress(`Executing ${toolName}...`, 0, 1);

        try {
            const requestBody = {
                query: query,
                max_results: parseInt(document.getElementById('tool-max-results').value),
                model: document.getElementById('tool-model').value
            };

            // Add tool-specific parameters
            if (toolName === 'batch_analyze') {
                const analyses = Array.from(document.querySelectorAll('input[name="analyses"]:checked'))
                    .map(checkbox => checkbox.value);
                requestBody.analyses = analyses;
            } else if (toolName === 'execute_workflow') {
                requestBody.workflow_type = document.getElementById('workflow-type').value;
                const customInstructions = document.getElementById('custom-instructions-tool').value.trim();
                if (customInstructions) {
                    requestBody.custom_instructions = customInstructions;
                }
            }

            const response = await fetch(`${this.baseUrl}/api/tools/${toolName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            this.hideProgress();

            if (data.success) {
                this.displayToolResults(toolName, data);
                this.switchTab('tools');
                this.showNotification(`Tool ${toolName} executed successfully in ${data.execution_time}s`, 'success');
            } else {
                this.showNotification(`Tool execution failed: ${data.message}`, 'error');
            }

        } catch (error) {
            console.error('Tool execution failed:', error);
            this.hideProgress();
            this.showNotification('Tool execution failed. Please try again.', 'error');
        }
    }

    async runAutomation(type) {
        const query = document.getElementById('search-query').value.trim();
        const maxResults = document.getElementById('max-results').value;
        const model = document.getElementById('model-select').value;
        
        if (!query) {
            this.showNotification('Please enter a search query', 'warning');
            return;
        }

        const workflowType = type.toUpperCase();
        
        try {
            const response = await fetch(`${this.baseUrl}/api/automation/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    automation_type: workflowType,
                    max_results: parseInt(maxResults),
                    model: model
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.currentWorkflowId = data.workflow_id;
                this.startWorkflowMonitoring();
                this.showProgress('Starting automation workflow...', 0, 1);
                this.showNotification(`Automation workflow started (ID: ${data.workflow_id})`, 'success');
            } else {
                this.showNotification(`Automation failed: ${data.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Automation failed:', error);
            this.showNotification('Automation failed. Please try again.', 'error');
        }
    }

    async runCustomAutomation() {
        const query = document.getElementById('search-query').value.trim();
        const instructions = document.getElementById('custom-instructions').value.trim();
        const maxResults = document.getElementById('max-results').value;
        const model = document.getElementById('model-select').value;
        
        if (!query) {
            this.showNotification('Please enter a search query', 'warning');
            return;
        }
        
        if (!instructions) {
            this.showNotification('Please enter custom instructions', 'warning');
            return;
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/automation/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    automation_type: 'custom_workflow',
                    max_results: parseInt(maxResults),
                    model: model,
                    custom_instructions: instructions
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.currentWorkflowId = data.workflow_id;
                this.startWorkflowMonitoring();
                this.showProgress('Starting custom analysis...', 0, 1);
                this.showNotification(`Custom analysis started (ID: ${data.workflow_id})`, 'success');
            } else {
                this.showNotification(`Custom analysis failed: ${data.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Custom analysis failed:', error);
            this.showNotification('Custom analysis failed. Please try again.', 'error');
        }
    }

    startWorkflowMonitoring() {
        if (this.workflowCheckInterval) {
            clearInterval(this.workflowCheckInterval);
        }
        
        this.workflowCheckInterval = setInterval(async () => {
            if (!this.currentWorkflowId) return;
            
            try {
                const response = await fetch(`${this.baseUrl}/api/automation/status/${this.currentWorkflowId}`);
                const data = await response.json();
                
                if (data.progress) {
                    this.updateProgress(
                        data.progress.step_name,
                        data.progress.current_step,
                        data.progress.total_steps
                    );
                }
                
                if (data.status === 'completed') {
                    this.hideProgress();
                    clearInterval(this.workflowCheckInterval);
                    this.displayAutomationResults(data.results);
                    this.switchTab('automation');
                    this.showNotification('Automation workflow completed!', 'success');
                    this.loadSavedItems(); // Refresh saved items
                } else if (data.status === 'failed') {
                    this.hideProgress();
                    clearInterval(this.workflowCheckInterval);
                    this.showNotification(`Workflow failed: ${data.error}`, 'error');
                }
                
            } catch (error) {
                console.error('Workflow status check failed:', error);
            }
        }, 2000);
    }

    displayPapers(papers) {
        const container = document.getElementById('papers-list');
        
        if (papers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>No papers found for your query</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = papers.map(paper => `
            <div class="paper-card fade-in">
                <h3 class="paper-title">${this.escapeHtml(paper.title)}</h3>
                <div class="paper-authors">By: ${paper.authors.join(', ')}</div>
                <div class="paper-abstract">${this.escapeHtml(paper.summary)}</div>
                <a href="${paper.link}" target="_blank" class="paper-link">
                    <i class="fas fa-external-link-alt"></i> View on arXiv
                </a>
            </div>
        `).join('');
    }

    displaySummary(data) {
        const container = document.getElementById('summary-content');
        container.innerHTML = `
            <div class="content-box fade-in">
                <div class="summary-meta">
                    <strong>Query:</strong> ${this.escapeHtml(data.query)} | 
                    <strong>Papers used:</strong> ${data.papers_used} | 
                    <strong>Model:</strong> ${data.model}
                </div>
                <hr>
                <div class="summary-text">${this.formatText(data.summary)}</div>
            </div>
        `;
    }

    displayComparison(data) {
        const container = document.getElementById('comparison-content');
        
        if (data.comparison_table && data.comparison_table.length > 0) {
            container.innerHTML = `
                <div class="fade-in">
                    <div class="comparison-meta" style="margin-bottom: 1rem;">
                        <strong>Query:</strong> ${this.escapeHtml(data.query)} | 
                        <strong>Papers compared:</strong> ${data.papers_compared} | 
                        <strong>Model:</strong> ${data.model}
                    </div>
                    <table class="comparison-table">
                        <thead>
                            <tr>
                                <th>Paper Title</th>
                                <th>Research Focus</th>
                                <th>Methodology</th>
                                <th>Tools & Techniques</th>
                                <th>Advantages</th>
                                <th>Limitations</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.comparison_table.map(item => `
                                <tr>
                                    <td><strong>${this.escapeHtml(item.paper_title)}</strong></td>
                                    <td>${this.escapeHtml(item.research_focus)}</td>
                                    <td>${this.escapeHtml(item.methodology)}</td>
                                    <td>${this.escapeHtml(item.tools_techniques)}</td>
                                    <td>${this.escapeHtml(item.advantages)}</td>
                                    <td>${this.escapeHtml(item.limitations)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ${data.comparison_text && data.comparison_text !== 'Comparison generated successfully.' ? `
                        <div class="content-box" style="margin-top: 1rem;">
                            <h4>Additional Analysis:</h4>
                            <div>${this.formatText(data.comparison_text)}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="content-box">
                    <div class="comparison-meta">
                        <strong>Query:</strong> ${this.escapeHtml(data.query)} | 
                        <strong>Papers compared:</strong> ${data.papers_compared} | 
                        <strong>Model:</strong> ${data.model}
                    </div>
                    <hr>
                    <div>${this.formatText(data.comparison_text)}</div>
                </div>
            `;
        }
    }

    displayToolResults(toolName, data) {
        const container = document.getElementById('tools-content');
        let html = `
            <div class="tool-result fade-in">
                <div class="tool-header">
                    <h3><i class="fas fa-toolbox"></i> ${toolName}</h3>
                    <div class="tool-meta">
                        <span class="execution-time">Execution time: ${data.execution_time}s</span>
                        <span class="tool-status ${data.success ? 'success' : 'error'}">${data.success ? 'Success' : 'Failed'}</span>
                    </div>
                </div>
                <div class="tool-message">${data.message}</div>
        `;

        if (data.success && data.data) {
            html += this.renderToolData(toolName, data.data);
        }

        html += '</div>';
        container.innerHTML = html;
    }

    renderToolData(toolName, data) {
        switch (toolName) {
            case 'search_papers':
                return this.renderSearchResults(data);
            case 'summarize_papers':
                return this.renderSummaryResults(data);
            case 'compare_papers':
                return this.renderComparisonResults(data);
            case 'analyze_research_gaps':
                return this.renderGapAnalysisResults(data);
            case 'analyze_trends':
                return this.renderTrendAnalysisResults(data);
            case 'batch_analyze':
                return this.renderBatchAnalysisResults(data);
            case 'execute_workflow':
                return this.renderWorkflowResults(data);
            default:
                return `<pre class="data-json">${JSON.stringify(data, null, 2)}</pre>`;
        }
    }

    renderSearchResults(data) {
        return `
            <div class="search-results">
                <h4>Found ${data.total_results} papers for "${data.query}"</h4>
                <div class="papers-list">
                    ${data.papers.map(paper => `
                        <div class="paper-card">
                            <h4 class="paper-title">${this.escapeHtml(paper.title)}</h4>
                            <div class="paper-authors">By: ${paper.authors.join(', ')}</div>
                            <div class="paper-abstract">${this.escapeHtml(paper.summary)}</div>
                            <a href="${paper.link}" target="_blank" class="paper-link">
                                <i class="fas fa-external-link-alt"></i> View on arXiv
                            </a>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderSummaryResults(data) {
        return `
            <div class="summary-results">
                <div class="result-meta">
                    <strong>Papers used:</strong> ${data.papers_used} | 
                    <strong>Model:</strong> ${data.model}
                </div>
                <div class="content-box">${this.formatText(data.summary)}</div>
            </div>
        `;
    }

    renderComparisonResults(data) {
        if (data.comparison && data.comparison.comparison_table) {
            return `
                <div class="comparison-results">
                    <div class="result-meta">
                        <strong>Papers compared:</strong> ${data.papers_compared} | 
                        <strong>Model:</strong> ${data.model}
                    </div>
                    <table class="comparison-table">
                        <thead>
                            <tr>
                                <th>Paper Title</th>
                                <th>Research Focus</th>
                                <th>Methodology</th>
                                <th>Tools & Techniques</th>
                                <th>Advantages</th>
                                <th>Limitations</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.comparison.comparison_table.map(item => `
                                <tr>
                                    <td><strong>${this.escapeHtml(item.paper_title)}</strong></td>
                                    <td>${this.escapeHtml(item.research_focus)}</td>
                                    <td>${this.escapeHtml(item.methodology)}</td>
                                    <td>${this.escapeHtml(item.tools_techniques)}</td>
                                    <td>${this.escapeHtml(item.advantages)}</td>
                                    <td>${this.escapeHtml(item.limitations)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        return `<pre class="data-json">${JSON.stringify(data, null, 2)}</pre>`;
    }

    renderGapAnalysisResults(data) {
        return `
            <div class="gap-analysis-results">
                <div class="result-meta">
                    <strong>Papers analyzed:</strong> ${data.papers_analyzed} | 
                    <strong>Model:</strong> ${data.model}
                </div>
                <div class="content-box">${this.formatText(data.gap_analysis)}</div>
            </div>
        `;
    }

    renderTrendAnalysisResults(data) {
        return `
            <div class="trend-analysis-results">
                <div class="result-meta">
                    <strong>Papers analyzed:</strong> ${data.papers_analyzed} | 
                    <strong>Model:</strong> ${data.model}
                </div>
                <div class="content-box">${this.formatText(data.trend_analysis)}</div>
            </div>
        `;
    }

    renderBatchAnalysisResults(data) {
        let html = `
            <div class="batch-analysis-results">
                <div class="result-meta">
                    <strong>Papers found:</strong> ${data.papers_found} | 
                    <strong>Analyses run:</strong> ${Object.keys(data.analyses).length}
                </div>
        `;

        Object.keys(data.analyses).forEach(analysis => {
            html += `
                <div class="analysis-section">
                    <h4>${analysis.replace('_', ' ').toUpperCase()}</h4>
                    <div class="content-box">${this.formatText(data.analyses[analysis])}</div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    renderWorkflowResults(data) {
        return `
            <div class="workflow-results">
                <div class="result-meta">
                    <strong>Workflow ID:</strong> ${data.workflow_id} | 
                    <strong>Type:</strong> ${data.workflow_type} | 
                    <strong>Status:</strong> ${data.status}
                </div>
                <div class="content-box">
                    <p>Workflow started successfully. Use the Automation tab to monitor progress.</p>
                    <p><strong>Query:</strong> ${data.query}</p>
                </div>
            </div>
        `;
    }

    displayAutomationResults(results) {
        const container = document.getElementById('automation-content');
        let html = '<div class="fade-in">';
        
        if (results.summary) {
            html += `
                <div class="automation-result">
                    <h4><i class="fas fa-file-alt"></i> Summary</h4>
                    <div class="content-box">${this.formatText(results.summary)}</div>
                </div>
            `;
        }
        
        if (results.comparison) {
            html += `
                <div class="automation-result">
                    <h4><i class="fas fa-balance-scale"></i> Comparison</h4>
                    <div class="content-box">${JSON.stringify(results.comparison, null, 2)}</div>
                </div>
            `;
        }
        
        if (results.gap_analysis) {
            html += `
                <div class="automation-result">
                    <h4><i class="fas fa-search-minus"></i> Gap Analysis</h4>
                    <div class="content-box">${this.formatText(results.gap_analysis)}</div>
                </div>
            `;
        }
        
        if (results.trend_analysis) {
            html += `
                <div class="automation-result">
                    <h4><i class="fas fa-chart-line"></i> Trend Analysis</h4>
                    <div class="content-box">${this.formatText(results.trend_analysis)}</div>
                </div>
            `;
        }
        
        if (results.custom_analysis) {
            html += `
                <div class="automation-result">
                    <h4><i class="fas fa-cogs"></i> Custom Analysis</h4>
                    <div class="content-box">${this.formatText(results.custom_analysis)}</div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
    }

    async loadSavedItems() {
        await this.loadSavedSummaries();
        await this.loadSavedComparisons();
        await this.loadSavedWorkflows();
    }

    async loadSavedSummaries() {
        try {
            const response = await fetch(`${this.baseUrl}/api/saved-summaries`);
            const data = await response.json();
            
            const container = document.getElementById('saved-summaries');
            this.renderSavedItems(container, data.summaries || [], 'summary');
        } catch (error) {
            console.error('Failed to load saved summaries:', error);
        }
    }

    async loadSavedComparisons() {
        try {
            const response = await fetch(`${this.baseUrl}/api/saved-comparisons`);
            const data = await response.json();
            
            const container = document.getElementById('saved-comparisons');
            this.renderSavedItems(container, data.comparisons || [], 'comparison');
        } catch (error) {
            console.error('Failed to load saved comparisons:', error);
        }
    }

    async loadSavedWorkflows() {
        try {
            const response = await fetch(`${this.baseUrl}/api/automation/results`);
            const data = await response.json();
            
            const container = document.getElementById('saved-workflows');
            this.renderSavedItems(container, data.workflows || [], 'workflow');
        } catch (error) {
            console.error('Failed to load saved workflows:', error);
        }
    }

    renderSavedItems(container, items, type) {
        if (!items || items.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No saved items</p></div>';
            return;
        }
        
        container.innerHTML = items.map(item => `
            <div class="saved-item">
                <div class="saved-info">
                    <div class="saved-name">${this.getDisplayName(item.filename)}</div>
                    <div class="saved-meta">
                        Created: ${new Date(item.created).toLocaleString()} | 
                        Size: ${this.formatFileSize(item.size)}
                    </div>
                </div>
                <div class="saved-actions">
                    <button class="btn btn-outline" onclick="arxiv.loadSavedItem('${type}', '${item.filename}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                </div>
            </div>
        `).join('');
    }

    async loadSavedItem(type, filename) {
        try {
            let endpoint;
            if (type === 'summary') {
                // For text files, we need to fetch as text
                const response = await fetch(`${this.baseUrl}/summaries/${filename}`);
                const text = await response.text();
                this.displaySavedSummary(text, filename);
            } else if (type === 'comparison') {
                endpoint = `${this.baseUrl}/api/comparison/${filename}`;
                const response = await fetch(endpoint);
                const data = await response.json();
                this.displaySavedComparison(data, filename);
            } else if (type === 'workflow') {
                endpoint = `${this.baseUrl}/api/automation/results/${filename}`;
                const response = await fetch(endpoint);
                const data = await response.json();
                this.displayAutomationResults(data);
                this.switchTab('automation');
            }
        } catch (error) {
            console.error('Failed to load saved item:', error);
            this.showNotification('Failed to load saved item', 'error');
        }
    }

    displaySavedSummary(content, filename) {
        const container = document.getElementById('summary-content');
        container.innerHTML = `
            <div class="content-box fade-in">
                <div class="summary-meta">
                    <strong>File:</strong> ${filename}
                </div>
                <hr>
                <div class="summary-text">${this.formatText(content)}</div>
            </div>
        `;
        this.switchTab('summary');
    }

    displaySavedComparison(data, filename) {
        // Reuse the comparison display logic
        this.displayComparison({
            ...data,
            query: `Saved: ${filename}`,
            papers_compared: data.comparison_table ? data.comparison_table.length : 0,
            model: 'Unknown'
        });
        this.switchTab('comparison');
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update tab content
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `${tabName}-tab`);
        });
    }

    showProgress(title, current, total) {
        const progressSection = document.getElementById('progress-section');
        const progressTitle = document.getElementById('progress-title');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        progressTitle.textContent = title;
        this.updateProgress('Initializing...', current, total);
        progressSection.classList.remove('hidden');
    }

    updateProgress(text, current, total) {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        const percentage = total > 0 ? (current / total) * 100 : 0;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = text;
    }

    hideProgress() {
        document.getElementById('progress-section').classList.add('hidden');
    }

    clearResults() {
        if (confirm('Are you sure you want to clear all results?')) {
            document.getElementById('papers-list').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>Search for papers to see results</p>
                </div>
            `;
            
            document.getElementById('summary-content').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <p>Generate a summary to see results</p>
                </div>
            `;
            
            document.getElementById('comparison-content').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-balance-scale"></i>
                    <p>Generate a comparison to see results</p>
                </div>
            `;
            
            document.getElementById('automation-content').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-magic"></i>
                    <p>Run an automation workflow to see results</p>
                </div>
            `;
            
            document.getElementById('tools-content').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-toolbox"></i>
                    <p>Execute a tool to see results</p>
                </div>
            `;
            
            this.showNotification('Results cleared', 'success');
        }
    }

    exportResults() {
        // Simple export functionality - could be enhanced
        const content = document.querySelector('.tab-pane.active').innerText;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `arxiv-results-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('Results exported', 'success');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;
        
        // Add styles if not already added
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 1rem 1.5rem;
                    border-radius: 5px;
                    color: white;
                    z-index: 1000;
                    animation: slideIn 0.3s ease-out;
                    max-width: 400px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
                .notification-success { background: #27ae60; }
                .notification-error { background: #e74c3c; }
                .notification-warning { background: #f39c12; }
                .notification-info { background: #3498db; }
                .notification-content {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(notification);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    // Utility functions
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatText(text) {
        return this.escapeHtml(text).replace(/\n/g, '<br>');
    }

    getDisplayName(filename) {
        return filename.replace(/_/g, ' ').replace(/\.(txt|json)$/, '');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.arxiv = new ArxivSummarizer();
});