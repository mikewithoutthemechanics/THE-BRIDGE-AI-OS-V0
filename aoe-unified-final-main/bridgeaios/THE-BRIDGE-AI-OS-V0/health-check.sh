#!/bin/bash
# THE BRIDGE AI OS - Health Check Script
# This script performs comprehensive health checks for the production deployment

set -e

# Configuration
APP_NAME="the-bridge-ai-os"
APP_DIR="/opt/$APP_NAME"
HEALTH_URL="http://localhost:3000/api/health"
SYSTEM_URL="http://localhost:3000/api/system-status"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
LOG_FILE="$APP_DIR/logs/health_$(date +%Y%m%d).log"
echo "$(date): 🔍 Running health checks..." >> "$LOG_FILE"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
    echo "$(date): INFO: $1" >> "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "$(date): SUCCESS: $1" >> "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "$(date): WARNING: $1" >> "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "$(date): ERROR: $1" >> "$LOG_FILE"
}

# Check if application is running
check_pm2_status() {
    log_info "Checking PM2 status..."
    if pm2 describe $APP_NAME > /dev/null 2>&1; then
        PM2_STATUS=$(pm2 jlist | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.status")
        if [ "$PM2_STATUS" = "online" ]; then
            log_success "PM2 process is online"
            return 0
        else
            log_error "PM2 process is $PM2_STATUS"
            return 1
        fi
    else
        log_error "PM2 process not found"
        return 1
    fi
}

# Check application health endpoint
check_app_health() {
    log_info "Checking application health endpoint..."
    if curl -f -s --max-time 10 "$HEALTH_URL" > /dev/null; then
        log_success "Health endpoint is responding"
        return 0
    else
        log_error "Health endpoint is not responding"
        return 1
    fi
}

# Check system status endpoint
check_system_status() {
    log_info "Checking system status..."
    if curl -f -s --max-time 10 "$SYSTEM_URL" > /dev/null; then
        log_success "System status endpoint is responding"
        return 0
    else
        log_warning "System status endpoint is not responding"
        return 1
    fi
}

# Check Nginx status
check_nginx() {
    log_info "Checking Nginx status..."
    if sudo systemctl is-active --quiet nginx; then
        log_success "Nginx is running"
        return 0
    else
        log_error "Nginx is not running"
        return 1
    fi
}

# Check disk space
check_disk_space() {
    log_info "Checking disk space..."
    DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ $DISK_USAGE -gt 90 ]; then
        log_error "Disk usage is ${DISK_USAGE}% - cleanup needed"
        return 1
    elif [ $DISK_USAGE -gt 80 ]; then
        log_warning "Disk usage is ${DISK_USAGE}%"
        return 0
    else
        log_success "Disk usage is ${DISK_USAGE}%"
        return 0
    fi
}

# Check memory usage
check_memory() {
    log_info "Checking memory usage..."
    MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [ $MEMORY_USAGE -gt 90 ]; then
        log_error "Memory usage is ${MEMORY_USAGE}% - restart recommended"
        return 1
    elif [ $MEMORY_USAGE -gt 80 ]; then
        log_warning "Memory usage is ${MEMORY_USAGE}%"
        return 0
    else
        log_success "Memory usage is ${MEMORY_USAGE}%"
        return 0
    fi
}

# Check CPU usage
check_cpu() {
    log_info "Checking CPU usage..."
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    CPU_INT=$(printf "%.0f" $CPU_USAGE)
    if [ $CPU_INT -gt 90 ]; then
        log_error "CPU usage is ${CPU_INT}% - high load detected"
        return 1
    elif [ $CPU_INT -gt 80 ]; then
        log_warning "CPU usage is ${CPU_INT}%"
        return 0
    else
        log_success "CPU usage is ${CPU_INT}%"
        return 0
    fi
}

# Check log file sizes
check_logs() {
    log_info "Checking log file sizes..."
    if [ -d "$APP_DIR/logs" ]; then
        LARGE_LOGS=$(find "$APP_DIR/logs" -name "*.log" -size +100M)
        if [ -n "$LARGE_LOGS" ]; then
            log_warning "Large log files found (>100MB):"
            echo "$LARGE_LOGS" | while read log_file; do
                log_warning "  $(basename "$log_file"): $(du -h "$log_file" | cut -f1)"
            done
            return 1
        else
            log_success "Log files are within size limits"
            return 0
        fi
    else
        log_warning "Logs directory not found"
        return 1
    fi
}

# Check SSL certificate (if enabled)
check_ssl() {
    if [ "$SSL_ENABLED" = "true" ] && [ -n "$DOMAIN" ]; then
        log_info "Checking SSL certificate..."
        if openssl s_client -connect $DOMAIN:443 -servername $DOMAIN < /dev/null > /dev/null 2>&1; then
            EXPIRY=$(openssl s_client -connect $DOMAIN:443 -servername $DOMAIN 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d'=' -f2)
            EXPIRY_DATE=$(date -d "$EXPIRY" +%s)
            CURRENT_DATE=$(date +%s)
            DAYS_LEFT=$(( ($EXPIRY_DATE - $CURRENT_DATE) / 86400 ))

            if [ $DAYS_LEFT -lt 30 ]; then
                log_error "SSL certificate expires in $DAYS_LEFT days - renewal needed"
                return 1
            else
                log_success "SSL certificate expires in $DAYS_LEFT days"
                return 0
            fi
        else
            log_error "SSL certificate check failed"
            return 1
        fi
    fi
}

# Main health check function
run_health_checks() {
    echo "🌉 THE BRIDGE AI OS - Health Check Report"
    echo "═══════════════════════════════════════════════"
    echo "Timestamp: $(date)"
    echo ""

    local checks_passed=0
    local total_checks=0

    # Run all checks
    ((total_checks++))
    check_pm2_status && ((checks_passed++))

    ((total_checks++))
    check_app_health && ((checks_passed++))

    ((total_checks++))
    check_system_status && ((checks_passed++))

    ((total_checks++))
    check_nginx && ((checks_passed++))

    ((total_checks++))
    check_disk_space && ((checks_passed++))

    ((total_checks++))
    check_memory && ((checks_passed++))

    ((total_checks++))
    check_cpu && ((checks_passed++))

    ((total_checks++))
    check_logs && ((checks_passed++))

    check_ssl

    echo ""
    echo "📊 Health Check Summary: $checks_passed/$total_checks checks passed"

    # Overall status
    if [ $checks_passed -eq $total_checks ]; then
        log_success "🎉 All health checks passed!"
        echo "$(date): HEALTH_CHECK_PASSED: $checks_passed/$total_checks" >> "$LOG_FILE"
        return 0
    elif [ $checks_passed -ge $((total_checks - 2)) ]; then
        log_warning "⚠️  Most health checks passed ($checks_passed/$total_checks)"
        echo "$(date): HEALTH_CHECK_WARNING: $checks_passed/$total_checks" >> "$LOG_FILE"
        return 0
    else
        log_error "❌ Health checks failed ($checks_passed/$total_checks)"
        echo "$(date): HEALTH_CHECK_FAILED: $checks_passed/$total_checks" >> "$LOG_FILE"
        return 1
    fi
}

# Recovery actions
recovery_actions() {
    log_info "Running recovery actions..."

    # Restart application if needed
    if ! check_pm2_status > /dev/null 2>&1; then
        log_info "Attempting to restart application..."
        pm2 restart $APP_NAME
        sleep 10
        if check_app_health > /dev/null 2>&1; then
            log_success "Application restarted successfully"
        else
            log_error "Application restart failed"
        fi
    fi

    # Restart Nginx if needed
    if ! check_nginx > /dev/null 2>&1; then
        log_info "Attempting to restart Nginx..."
        sudo systemctl restart nginx
        sleep 5
        if check_nginx > /dev/null 2>&1; then
            log_success "Nginx restarted successfully"
        else
            log_error "Nginx restart failed"
        fi
    fi
}

# Main execution
main() {
    # Load environment variables
    if [ -f "$APP_DIR/.env.production" ]; then
        export $(grep -v '^#' "$APP_DIR/.env.production" | xargs)
    fi

    # Run health checks
    if run_health_checks; then
        exit 0
    else
        log_warning "Health checks failed - attempting recovery..."
        recovery_actions
        exit 1
    fi
}

# Run main function
main "$@"