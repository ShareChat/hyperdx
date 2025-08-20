import { useMemo } from 'react';
import { HDX_AUTH_EMAILS } from '@/config';

/**
 * Custom hook to parse and manage authentication email configuration
 * @returns {Object} authArray - Parsed email configuration object
 */
export const useAuthEmails = () => {
  const authArray = useMemo(() => {
    
    if (!HDX_AUTH_EMAILS) {
      console.warn('HDX_AUTH_EMAILS environment variable is not set');
      return {};
    }
    
    try {
      const parsed = JSON.parse(HDX_AUTH_EMAILS);
      console.log('Parsed authArray:', parsed);
      return parsed;
    } catch (error) {
      console.warn('Failed to parse HDX_AUTH_EMAILS:', error);
      return {};
    }
  }, []);

  /**
   * Check if a specific email has access
   * @param {string} email - Email to check
   * @returns {boolean} - Whether the email has access
   */
  const hasAccess = (email?: string) => {
    if (!email || !authArray) return false;
    return Boolean(authArray[email as keyof typeof authArray]);
  };

  /**
   * Get all authorized emails
   * @returns {string[]} - Array of email addresses with access
   */
  const getAuthorizedEmails = () => {
    return Object.keys(authArray).filter(email => authArray[email as keyof typeof authArray]);
  };

  return {
    authArray,
    hasAccess,
    getAuthorizedEmails,
  };
};
