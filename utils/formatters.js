// formatters.js - Formatting utility functions

// Format timestamp to readable date/time
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Truncate text to specified length
function truncateText(text, maxLength = 100) {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Get time ago string (e.g., "5m ago", "2h ago")
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Export functions
window.formatters = {
  formatTimestamp,
  truncateText,
  getTimeAgo
};
