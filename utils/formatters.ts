// formatters.ts - Formatting utility functions

// Format timestamp to readable date/time
function formatTimestamp(timestamp: string | number | Date): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Truncate text to specified length
function truncateText(text: string, maxLength: number = 100): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Get time ago string (e.g., "5m ago", "2h ago")
function getTimeAgo(date: string | number | Date): string {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Export functions for backward compatibility
if (typeof window !== 'undefined') {
  (window as any).formatters = {
    formatTimestamp,
    truncateText,
    getTimeAgo
  };
}
