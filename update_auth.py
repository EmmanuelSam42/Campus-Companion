import re

file_path = 'c:/Users/Gifted Soul/Desktop/Projects/Campus Companion Trade/js/script.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace doLogin
do_login_start = 'function doLogin() {'
do_login_end = '}' # This is too common. I'll find the block.

# Let's use a more precise approach. I'll identify the start of doLogin and doRegister.
# and replace the whole block up to the next function.

def replace_function(name, new_code):
    pattern = re.compile(f'function {name}\\s*\\(.*?\\)\\s*{{.*?}}', re.DOTALL)
    # Since functions contain {}, we need a way to match the correct closing brace.
    # I'll just use a simpler search: find "function doLogin() {" and the next "function "

    start_idx = content.find(f'function {name}(', 0)
    if start_idx == -1: return content

    # Find the end of the function by tracking braces
    brace_count = 0
    for i in range(start_idx, len(content)):
        if content[i] == '{':
            brace_count += 1
        elif content[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                return content[:start_idx] + new_code + content[i+1:]
    return content

new_do_login = """async function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');

  if (!email || !pass) {
    errEl.textContent = 'Please fill in all fields.';
    return;
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (authError) { errEl.textContent = 'Invalid email or password.'; return; }

    const { data: profile, error: profError } = await supabase.from('profiles').select('*').eq('id', authData.user.id).single();
    if (profError || !profile) { errEl.textContent = 'Profile not found.'; await supabase.auth.signOut(); return; }

    if (profile.status === 'pending') {
      errEl.innerHTML = '<span style="color:var(--gold)">⏳ Your account is pending admin approval.</span>';
      await supabase.auth.signOut();
      return;
    }
    if (profile.status === 'rejected') {
      errEl.innerHTML = '<span style="color:#FF6B7A">✗ Your account was rejected. Contact support.</span>';
      await supabase.auth.signOut();
      return;
    }

    currentUser = profile;
    updateHeaderUI();
    await mergeCarts();
    errEl.textContent = '';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    toast('Welcome back, ' + profile.full_name + '! 👋', 'success');
    if (profile.role === 'admin') showView('admin');
    else if (profile.role === 'vendor') showView('vendor-dashboard');
    else showView('home');
  } catch (err) {
    console.error(err);
    errEl.textContent = 'An unexpected error occurred.';
  }
}"""

new_do_register = """async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;

  const bname = document.getElementById('reg-business')?.value.trim();
  const btype = document.getElementById('reg-btype')?.value;
  const phone = document.getElementById('reg-phone')?.value.trim();
  const hall = document.getElementById('reg-hall')?.value.trim();
  const studentId = document.getElementById('reg-student-id')?.value.trim();

  const errEl = document.getElementById('reg-error');

  if (!name || !email || !pass) { errEl.textContent = 'Please fill in required fields.'; return; }
  if (pass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
  if (pass !== confirm) { errEl.textContent = 'Passwords do not match.'; return; }
  if (selectedRole === 'vendor' && !bname) { errEl.textContent = 'Business name is required for vendors.'; return; }

  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: name, role: selectedRole } }
    });

    if (authError) { errEl.textContent = authError.message; return; }

    const profileData = {
      id: authData.user.id,
      full_name: name,
      email: email,
      role: selectedRole,
      phone: phone || '',
      student_id: studentId || '',
      hall: hall || '',
      business_name: bname || null,
      business_type: btype || null,
      status: 'pending',
      verified: false,
      created_at: new Date().toISOString()
    };

    const { error: profError } = await supabase.from('profiles').insert(profileData);
    if (profError) { errEl.textContent = 'Error creating profile. Please try again.'; return; }

    errEl.textContent = '';
    document.getElementById('reg-pending').classList.remove('hidden');
    ['reg-name','reg-email','reg-password','reg-confirm','reg-business'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    toast('Account created! Awaiting admin approval.', 'success');
    await supabase.auth.signOut();
  } catch (err) {
    console.error(err);
    errEl.textContent = 'An unexpected error occurred.';
  }
}"""

content = replace_function('doLogin', new_do_login)
content = replace_function('doRegister', new_do_register)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
