class ArxivSummarizer {
    constructor() {
        this.baseUrl = "http://localhost:8000";
        this.currentWorkflowId = null;
        this.workflowCheckInterval = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkHealth();
        this.loadModels();
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