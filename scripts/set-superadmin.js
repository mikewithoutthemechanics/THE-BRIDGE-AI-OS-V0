const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sdkysuvmtqjqopmdpvoz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNka3lzdXZtdHFqcW9wbWRwdm96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY4NTgzNCwiZXhwIjoyMDkxMjYxODM0fQ.3dCkxsaCPMjN88h3EftSpAfTmU0ECOspXHqT3yAjGX0'
);

const TARGET_EMAIL = 'ryanpcowan@gmail.com';

async function main() {
  console.log('=== Set Superadmin Script ===\n');

  // Step 1: Check auth.users for Google OAuth signup
  console.log('1. Checking auth.users for', TARGET_EMAIL, '...');
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('Error listing auth users:', authError.message);
  }

  let authUser = null;
  if (authData && authData.users) {
    authUser = authData.users.find(u => u.email === TARGET_EMAIL);
    if (authUser) {
      console.log('   FOUND in auth.users:');
      console.log('   - Auth ID:', authUser.id);
      console.log('   - Email:', authUser.email);
      console.log('   - Provider:', authUser.app_metadata?.provider || 'unknown');
      console.log('   - Providers:', JSON.stringify(authUser.app_metadata?.providers || []));
      console.log('   - Created:', authUser.created_at);
      console.log('   - Last sign in:', authUser.last_sign_in_at);
    } else {
      console.log('   NOT found in auth.users');
    }
  }

  // Step 2: Check public.users table
  console.log('\n2. Checking public.users for', TARGET_EMAIL, '...');
  const { data: existingUser, error: lookupError } = await supabase
    .from('users')
    .select('*')
    .eq('email', TARGET_EMAIL)
    .maybeSingle();

  if (lookupError) {
    console.error('Error looking up user:', lookupError.message);
    return;
  }

  if (existingUser) {
    console.log('   FOUND in public.users:', JSON.stringify(existingUser, null, 2));

    // Update existing user
    console.log('\n3. Updating user to superadmin/enterprise...');
    const updateData = { role: 'superadmin', plan: 'enterprise' };

    // If auth user exists and IDs don't match, update the id too
    if (authUser && existingUser.id !== authUser.id) {
      console.log('   NOTE: Auth ID mismatch. Public users id:', existingUser.id, '| Auth id:', authUser.id);
      console.log('   Will update name from auth if available.');
    }

    if (authUser && authUser.user_metadata?.full_name) {
      updateData.name = authUser.user_metadata.full_name;
    }

    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('email', TARGET_EMAIL)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError.message);
    } else {
      console.log('   SUCCESS. Updated user:', JSON.stringify(updated, null, 2));
    }
  } else {
    // Create new user
    console.log('   NOT found in public.users');
    console.log('\n3. Creating new superadmin user...');

    const newUser = {
      email: TARGET_EMAIL,
      role: 'superadmin',
      plan: 'enterprise',
      brdg_balance: 0,
      funnel_stage: 'active',
    };

    // Use auth user ID and name if available
    if (authUser) {
      newUser.id = authUser.id;
      if (authUser.user_metadata?.full_name) {
        newUser.name = authUser.user_metadata.full_name;
      }
    }

    const { data: created, error: createError } = await supabase
      .from('users')
      .insert(newUser)
      .select()
      .single();

    if (createError) {
      console.error('Create error:', createError.message);
    } else {
      console.log('   SUCCESS. Created user:', JSON.stringify(created, null, 2));
    }
  }

  // Step 4: Final verification
  console.log('\n4. Final verification...');
  const { data: finalUser } = await supabase
    .from('users')
    .select('*')
    .eq('email', TARGET_EMAIL)
    .single();

  console.log('   Final state:', JSON.stringify(finalUser, null, 2));
  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
