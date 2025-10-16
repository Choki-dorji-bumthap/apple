// Utility functions for text formatting

/**
 * Safely format text with markdown-like syntax without using dangerous HTML
 */
export const safeFormatText = (text: string): string => {
  if (!text) return '';
  
  // Escape HTML to prevent XSS
  let formatted = escapeHtml(text);
  
  // Convert markdown-like syntax to HTML
  formatted = formatted
    // Bold: **text** -> <strong>text</strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text* -> <em>text</em>
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Inline code: `code` -> <code class="inline-code">code</code>
    .replace(/`(.*?)`/g, '<code class="inline-code">$1</code>')
    // Line breaks
    .replace(/\n/g, '<br>')
    // Multiple line breaks to paragraphs
    .replace(/(<br>\s*){2,}/g, '</p><p>')
    // Wrap in paragraph tags if needed
    .replace(/^(.*)$/gm, '<p>$1</p>')
    // Remove empty paragraphs
    .replace(/<p><\/p>/g, '')
    // Clean up paragraph wrapping
    .replace(/<p>(<br>)*/g, '<p>')
    .replace(/(<br>)*<\/p>/g, '</p>');

  return formatted;
};

/**
 * Escape HTML to prevent XSS attacks
 */
export const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

/**
 * Truncate text to specified length with ellipsis
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Format date for display
 */
export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Extract paper title from filename
 */
export const getDisplayName = (filename: string): string => {
  return filename
    .replace(/_/g, ' ')
    .replace(/\.(txt|json)$/, '')
    .replace(/\d{8}_\d{6}/g, '') // Remove timestamps
    .replace(/_summary|_comparison|_workflow/gi, '')
    .trim();
};