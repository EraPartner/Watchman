// Comprehensive audit logging for security events
import { appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import logger from './logger.js';

class AuditLogger {
  constructor() {
    this.auditDir = path.join(process.cwd(), 'logs', 'audit');
    this.initializeAuditDir();
  }
  
  async initializeAuditDir() {
    try {
      if (!existsSync(this.auditDir)) {
        await mkdir(this.auditDir, { recursive: true });
      }
    } catch (error) {
      logger.error('Failed to create audit directory', { error: error.message });
    }
  }
  
  async log(event) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      ...event,
    };
    
    try {
      // Log to main logger
      logger.info('AUDIT', logEntry);
      
      // Also append to dated audit file
      const date = timestamp.split('T')[0];
      const auditFile = path.join(this.auditDir, `audit-${date}.log`);
      
      await appendFile(
        auditFile,
        JSON.stringify(logEntry) + '\n',
        'utf-8'
      );
    } catch (error) {
      logger.error('Failed to write audit log', { error: error.message });
    }
  }
  
  // Specific audit event types
  async logAuthentication(username, ip, success, metadata = {}) {
    await this.log({
      event: 'authentication',
      username,
      ip,
      success,
      ...metadata,
    });
  }
  
  async logAuthorization(username, ip, resource, action, allowed, metadata = {}) {
    await this.log({
      event: 'authorization',
      username,
      ip,
      resource,
      action,
      allowed,
      ...metadata,
    });
  }
  
  async logDataAccess(username, ip, resource, action, metadata = {}) {
    await this.log({
      event: 'data_access',
      username,
      ip,
      resource,
      action,
      ...metadata,
    });
  }
  
  async logConfigChange(username, ip, setting, oldValue, newValue, metadata = {}) {
    await this.log({
      event: 'config_change',
      username,
      ip,
      setting,
      oldValue: this.sanitizeValue(oldValue),
      newValue: this.sanitizeValue(newValue),
      ...metadata,
    });
  }
  
  async logSecurityEvent(type, ip, severity, description, metadata = {}) {
    await this.log({
      event: 'security_event',
      type,
      ip,
      severity,
      description,
      ...metadata,
    });
  }
  
  async logServiceControl(username, ip, service, action, success, metadata = {}) {
    await this.log({
      event: 'service_control',
      username,
      ip,
      service,
      action,
      success,
      ...metadata,
    });
  }
  
  // Sanitize sensitive values in logs
  sanitizeValue(value) {
    if (typeof value === 'string') {
      // Mask passwords, tokens, keys
      if (/(password|token|secret|key)/i.test(String(value))) {
        return '[REDACTED]';
      }
    }
    return value;
  }
}

export const auditLogger = new AuditLogger();

/**
 * Middleware to audit all authenticated requests
 */
export function auditMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  const startTime = Date.now();
  
  res.json = function(body) {
    const duration = Date.now() - startTime;
    
    // Only audit authenticated requests
    if (req.user) {
      const resource = req.path;
      const action = req.method;
      const success = res.statusCode < 400;
      
      auditLogger.logDataAccess(
        req.user.username,
        req.ip,
        resource,
        action,
        {
          statusCode: res.statusCode,
          duration,
          requestId: req.requestId,
        }
      ).catch(err => {
        logger.error('Failed to write audit log', { error: err.message });
      });
    }
    
    return originalJson(body);
  };
  
  next();
}

/**
 * Audit decorator for service control actions
 */
export function auditServiceControl(serviceName) {
  return function(req, res, next) {
    const originalJson = res.json.bind(res);
    
    res.json = function(body) {
      const success = res.statusCode < 400;
      
      if (req.user) {
        auditLogger.logServiceControl(
          req.user.username,
          req.ip,
          serviceName,
          req.method + ' ' + req.path,
          success,
          {
            statusCode: res.statusCode,
            requestId: req.requestId,
          }
        ).catch(err => {
          logger.error('Failed to write audit log', { error: err.message });
        });
      }
      
      return originalJson(body);
    };
    
    next();
  };
}
