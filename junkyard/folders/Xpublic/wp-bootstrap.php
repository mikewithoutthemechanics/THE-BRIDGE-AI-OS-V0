<?php
/**
 * Bridge AI OS — WordPress One-Shot Bootstrap
 * Upload this file to the webroot of each domain, then visit:
 *   https://bridge-ai-os.com/wp-bootstrap.php?token=bridge2025
 *   https://gateway.ai-os.co.za/wp-bootstrap.php?token=bridge2025
 *
 * It will:
 *   1. Download & install WordPress
 *   2. Create the brain@ admin user
 *   3. Generate an Application Password
 *   4. Return credentials as JSON
 *   5. DELETE ITSELF after first run
 */

define('BOOTSTRAP_TOKEN', 'bridge2025');
define('BOOTSTRAP_TIMEOUT', 300);

header('Content-Type: application/json');
set_time_limit(BOOTSTRAP_TIMEOUT);
ini_set('display_errors', 0);
error_reporting(0);

// ── Auth guard ────────────────────────────────────────────────────────────────
$token = $_GET['token'] ?? '';
if ($token !== BOOTSTRAP_TOKEN) {
    http_response_code(403);
    die(json_encode(['error' => 'Forbidden — supply ?token=bridge2025']));
}

$domain   = $_SERVER['HTTP_HOST'];
$siteUrl  = 'https://' . $domain;
$dir      = __DIR__;
$log      = [];
$results  = [];

function step($msg) { global $log; $log[] = $msg; }
function fail($msg) { global $log; die(json_encode(['error' => $msg, 'log' => $log])); }

// ── Detect which site ─────────────────────────────────────────────────────────
$siteMap = [
    'bridge-ai-os.com'     => ['db' => 'bridgeai_wp',  'dbuser' => 'bridgeai_wp',  'email' => 'brain@bridge-ai-os.com'],
    'gateway.ai-os.co.za'  => ['db' => 'gateway_wp',   'dbuser' => 'gateway_wp',   'email' => 'brain@gateway.ai-os.co.za'],
];
$site = $siteMap[$domain] ?? null;
if (!$site) fail('Unknown domain: ' . $domain);

// ── Step 1: Download WordPress if not present ─────────────────────────────────
if (!file_exists($dir . '/wp-includes/version.php')) {
    step('Downloading WordPress...');
    $wpZip = $dir . '/wordpress-latest.zip';
    $ok = copy('https://wordpress.org/latest.zip', $wpZip);
    if (!$ok) fail('Failed to download WordPress');

    step('Extracting WordPress...');
    $zip = new ZipArchive();
    if ($zip->open($wpZip) !== true) fail('Failed to open zip');
    $zip->extractTo($dir . '/../wp_extract_tmp/');
    $zip->close();

    // Move files from wordpress/ subfolder to webroot
    $extracted = $dir . '/../wp_extract_tmp/wordpress/';
    foreach (scandir($extracted) as $f) {
        if ($f === '.' || $f === '..') continue;
        rename($extracted . $f, $dir . '/' . $f);
    }
    @rmdir($dir . '/../wp_extract_tmp/wordpress/');
    @rmdir($dir . '/../wp_extract_tmp/');
    @unlink($wpZip);
    step('WordPress files extracted.');
} else {
    step('WordPress already present — skipping download.');
}

// ── Step 2: Create wp-config.php ──────────────────────────────────────────────
if (!file_exists($dir . '/wp-config.php')) {
    step('Creating wp-config.php...');
    $salt = function_exists('openssl_random_pseudo_bytes')
        ? bin2hex(openssl_random_pseudo_bytes(32))
        : md5(uniqid(mt_rand(), true));

    $dbHost = $_GET['dbhost'] ?? 'localhost';
    $dbPass = $_GET['dbpass'] ?? '';
    if (!$dbPass) fail('Provide ?dbpass=YOUR_DB_PASSWORD in the URL');

    $config = file_get_contents($dir . '/wp-config-sample.php');
    $config = str_replace('database_name_here', $site['db'],      $config);
    $config = str_replace('username_here',       $site['dbuser'],  $config);
    $config = str_replace('password_here',       $dbPass,          $config);
    $config = str_replace('localhost',           $dbHost,          $config);
    $config = preg_replace_callback(
        "/define\(\s*'(AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|AUTH_SALT|SECURE_AUTH_SALT|LOGGED_IN_SALT|NONCE_SALT)'\s*,\s*'put your unique phrase here'\s*\)/",
        fn($m) => "define('{$m[1]}', '" . bin2hex(openssl_random_pseudo_bytes(32)) . "')",
        $config
    );
    file_put_contents($dir . '/wp-config.php', $config);
    step('wp-config.php created.');
} else {
    step('wp-config.php already exists — skipping.');
}

// ── Step 3: Run WP install via internal REST ──────────────────────────────────
step('Running WordPress installer...');
require_once $dir . '/wp-load.php';
require_once $dir . '/wp-admin/includes/upgrade.php';

if (!function_exists('wp_install')) fail('wp-load failed — check wp-config.php settings');

$adminPass = wp_generate_password(16, true, true);

$installed = wp_install(
    'Bridge AI OS',   // site title
    'bridge-brain',   // admin username
    $site['email'],   // admin email
    true,             // public
    '',
    $adminPass,
    get_option('WPLANG') ?: 'en_US'
);

if (is_wp_error($installed)) {
    // Already installed — just get the admin user
    step('WordPress already installed — finding admin user.');
    $admin = get_user_by('login', 'bridge-brain');
    if (!$admin) {
        // Create the user
        $userId = wp_create_user('bridge-brain', $adminPass, $site['email']);
        if (is_wp_error($userId)) fail('Failed to create user: ' . $userId->get_error_message());
        $admin = get_user_by('id', $userId);
        wp_update_user(['ID' => $userId, 'role' => 'administrator']);
        step('Created bridge-brain user.');
    } else {
        step('User bridge-brain already exists.');
    }
    $userId = $admin->ID;
} else {
    $userId = $installed['user_id'];
    step('WordPress installed. Admin user ID: ' . $userId);
}

// ── Step 4: Generate Application Password ─────────────────────────────────────
step('Generating application password...');
if (!class_exists('WP_Application_Passwords')) {
    require_once ABSPATH . 'wp-includes/class-wp-application-passwords.php';
}

// Remove any existing bridge-brain app password to avoid duplicates
$existing = WP_Application_Passwords::get_user_application_passwords($userId);
foreach ($existing as $ap) {
    if ($ap['name'] === 'bridge-brain') {
        WP_Application_Passwords::delete_application_password($userId, $ap['uuid']);
        step('Removed old bridge-brain app password.');
    }
}

[$newPass, $item] = WP_Application_Passwords::create_new_application_password(
    $userId,
    ['name' => 'bridge-brain']
);

if (is_wp_error($newPass)) fail('App password creation failed: ' . $newPass->get_error_message());
step('Application password generated.');

// ── Step 5: Enable REST API + application passwords ───────────────────────────
update_option('default_pingback_flag', 0);
update_option('blog_public', 1);
// Force application passwords to be active (removes the SSL-only restriction for local dev)
add_filter('wp_is_application_passwords_available', '__return_true');

// ── Step 6: Self-delete ───────────────────────────────────────────────────────
step('Deleting bootstrap file...');
@unlink(__FILE__);

// ── Output ────────────────────────────────────────────────────────────────────
echo json_encode([
    'ok'          => true,
    'site'        => $siteUrl,
    'wp_user'     => 'bridge-brain',
    'wp_email'    => $site['email'],
    'app_password' => $newPass,
    'env_line'    => strtoupper(str_replace(['.', '-'], '_', $domain)) . '_APP_PASS=' . $newPass,
    'admin_url'   => $siteUrl . '/wp-admin/',
    'log'         => $log,
], JSON_PRETTY_PRINT);
