#!/bin/bash
# THE BRIDGE AI OS - Monitoring Script
# Continuous monitoring and alerting for production deployment

set -e

# Configuration
APP_NAME="the-bridge-ai-os"
APP_DIR="/opt/$APP_NAME"
LOG_FILE="$APP_DIR/logs/monitor_$(date +%Y%m%d).log"
ALERT_EMAIL="${ALERT_EMAIL:-admin@bridgeaios.com}"
HEALTH_CHECK_INTERVAL=300  # 5 minutes
METRICS_INTERVAL=60        # 1 minute

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Initialize log
echo "$(date): 🔍 Starting THE BRIDGE AI OS monitoring..." >> "$LOG_FILE"

log_info() {
    echo -e "${BLUE}[MONITOR]${NC} $1"
    echo "$(date): INFO: $1" >> "$LOG_FILE"
}

log_alert() {
    echo -e "${RED}[ALERT]${NC} $1"
    echo "$(date): ALERT: $1" >> "$LOG_FILE"

    # Send email alert if configured
    if command -v mail &> /dev/null && [ -n "$ALERT_EMAIL" ]; then
        echo "THE BRIDGE AI OS Alert: $1" | mail -s "BRIDGE AI OS Alert" "$ALERT_EMAIL"
    fi
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "$(date): SUCCESS: $1" >> "$LOG_FILE"
}

# Collect system metrics
collect_metrics() {
    local timestamp=$(date +%s)

    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')

    # Memory usage
    local mem_total=$(free | grep Mem | awk '{print $2}')
    local mem_used=$(free | grep Mem | awk '{print $3}')
    local mem_usage=$(echo "scale=2; $mem_used * 100 / $mem_total" | bc)

    # Disk usage
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

    # Network connections
    local connections=$(netstat -tun | grep ESTABLISHED | wc -l)

    # Application metrics
    local app_cpu=$(pm2 jlist | jq -r ".[] | select(.name==\"$APP_NAME\") | .monit.cpu" 2>/dev/null || echo "0")
    local app_memory=$(pm2 jlist | jq -r ".[] | select(.name==\"$APP_NAME\") | .monit.memory" 2>/dev/null || echo "0")

    # Log metrics
    echo "$timestamp,cpu=$cpu_usage,memory=$mem_usage,disk=$disk_usage,connections=$connections,app_cpu=$app_cpu,app_memory=$app_memory" >> "$APP_DIR/logs/metrics.csv"
}

# Monitor application status
monitor_app() {
    # Check PM2 status
    if pm2 describe $APP_NAME > /dev/null 2>&1; then
        local pm2_status=$(pm2 jlist | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.status")
        if [ "$pm2_status" != "online" ]; then
            log_alert "Application status is $pm2_status - attempting restart"
            pm2 restart $APP_NAME
            sleep 10
            if pm2 describe $APP_NAME > /dev/null 2>&1; then
                log_success "Application restarted successfully"
            else
                log_alert "Application restart failed"
            fi
        fi
    else
        log_alert "Application not found in PM2 - attempting to start"
        cd $APP_DIR && pm2 start ecosystem.config.js
    fi

    # Check health endpoint
    if ! curl -f -s --max-time 5 http://localhost:3000/api/health > /dev/null; then
        log_alert "Health check failed - application may be unresponsive"
    fi
}

# Monitor system resources
monitor_system() {
    # Check disk space
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ $disk_usage -gt 90 ]; then
        log_alert "Disk usage is ${disk_usage}% - cleanup required"
    elif [ $disk_usage -gt 80 ]; then
        log_info "Disk usage is ${disk_usage}% - monitor closely"
    fi

    # Check memory usage
    local mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [ $mem_usage -gt 90 ]; then
        log_alert "Memory usage is ${mem_usage}% - restart recommended"
    elif [ $mem_usage -gt 80 ]; then
        log_info "Memory usage is ${mem_usage}% - monitor closely"
    fi

    # Check CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    local cpu_int=$(printf "%.0f" $cpu_usage)
    if [ $cpu_int -gt 90 ]; then
        log_alert "CPU usage is ${cpu_int}% - high load detected"
    fi
}

# Monitor Nginx
monitor_nginx() {
    if ! sudo systemctl is-active --quiet nginx; then
        log_alert "Nginx is not running - attempting restart"
        sudo systemctl restart nginx
        sleep 5
        if sudo systemctl is-active --quiet nginx; then
            log_success "Nginx restarted successfully"
        else
            log_alert "Nginx restart failed"
        fi
    fi
}

# Generate daily report
generate_report() {
    local yesterday=$(date -d 'yesterday' +%Y%m%d)
    local report_file="$APP_DIR/logs/daily_report_$yesterday.txt"

    if [ -f "$APP_DIR/logs/monitor_$yesterday.log" ]; then
        echo "THE BRIDGE AI OS - Daily Report for $yesterday" > "$report_file"
        echo "═══════════════════════════════════════════════" >> "$report_file"
        echo "" >> "$report_file"

        # Count alerts and errors
        local alerts=$(grep -c "ALERT:" "$APP_DIR/logs/monitor_$yesterday.log")
        local errors=$(grep -c "ERROR:" "$APP_DIR/logs/monitor_$yesterday.log")

        echo "📊 Summary:" >> "$report_file"
        echo "   • Alerts: $alerts" >> "$report_file"
        echo "   • Errors: $errors" >> "$report_file"
        echo "" >> "$report_file"

        # Show last 10 log entries
        echo "🔍 Recent Activity:" >> "$report_file"
        tail -10 "$APP_DIR/logs/monitor_$yesterday.log" >> "$report_file"
        echo "" >> "$report_file"

        # System status
        echo "🖥️  System Status:" >> "$report_file"
        echo "   • Uptime: $(uptime -p)" >> "$report_file"
        echo "   • Load Average: $(uptime | awk -F'load average:' '{ print $2 }')" >> "$report_file"
        echo "   • Disk Usage: $(df -h / | tail -1 | awk '{print $5}')" >> "$report_file"
        echo "   • Memory Usage: $(free -h | grep Mem | awk '{print $3 "/" $2}')" >> "$report_file"

        log_info "Daily report generated: $report_file"
    fi
}

# Main monitoring loop
main() {
    log_info "THE BRIDGE AI OS monitoring started"

    local metrics_counter=0
    local health_counter=0

    while true; do
        # Collect metrics every minute
        if [ $metrics_counter -ge $METRICS_INTERVAL ]; then
            collect_metrics
            metrics_counter=0
        fi

        # Run health checks every 5 minutes
        if [ $health_counter -ge $HEALTH_CHECK_INTERVAL ]; then
            monitor_app
            monitor_system
            monitor_nginx

            # Generate daily report at midnight
            if [ $(date +%H%M) = "0000" ]; then
                generate_report
            fi

            health_counter=0
        fi

        # Increment counters
        ((metrics_counter++))
        ((health_counter++))

        # Sleep for 1 minute
        sleep 60
    done
}

# Handle signals
trap 'log_info "Monitoring stopped by user"; exit 0' INT TERM

# Run main function
main "$@"