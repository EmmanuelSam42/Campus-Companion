// ============================================================
// CAMPUS COMPANION TRADE - CORE SCRIPT
// Powered by Supabase (PostgreSQL + Auth + Storage)
// ============================================================

// --- LOCAL STORAGE HELPER ---
const DB = {
  get: (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  del: (key) => localStorage.removeItem(key),
};

// --- CONFIGURATION ---
const SUPABASE_URL = "https://dhidvacvupjihqnzwdik.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoaWR2YWN2dXBqaWhxbnp3ZGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzY1ODcsImV4cCI6MjA5MzY1MjU4N30.190oSwDZuLEfpjkvVqG7tL4dG9iHvxBU2YHk-Zg_z9Y";
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

// --- STATE ---
let currentUser = null;
let currentDetailProduct = null;
let currentDetailQty = 1;
let selectedRole = "customer";

// ============================================================
// INIT
// ============================================================
window.onload = async () => {
  // 1. Check for active session
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session) {
    // Fetch full profile from 'profiles' table
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (profile) {
      currentUser = profile;
      // Status Check: Only approved accounts can enter
      if (profile.status === "pending") {
        await supabaseClient.auth.signOut();
        currentUser = null;
        toast("Account pending admin approval.", "warning");
      } else if (profile.status === "rejected") {
        await supabaseClient.auth.signOut();
        currentUser = null;
        toast("Account rejected. Please contact support.", "error");
      }
    }
  }

  updateHeaderUI();

  // Merge guest cart if we just logged in
  if (currentUser) {
    await mergeCarts();
    updateSettingsUI();
  }

  // Initial View Routing
  if (!currentUser) {
    showView("home"); // Guest landing
  } else {
    if (currentUser.role === "admin") showView("admin");
    else if (currentUser.role === "vendor") showView("vendor-dashboard");
    else showView("home");
  }

  // Load Site Settings
  const { data: settings } = await supabase
    .from("site_settings")
    .select("tagline")
    .single();
  if (settings) {
    document.getElementById("site-tagline").textContent = settings.tagline;
  }

  renderFeaturedProducts();
  updateCartBadge();
};

// ============================================================
// NAVIGATION
// ============================================================
function showView(viewId) {
  document
    .querySelectorAll(".functional-view")
    .forEach((v) => v.classList.add("hidden"));
  if (viewId !== "none") {
    const view = document.getElementById("view-" + viewId);
    if (view) {
      view.classList.remove("hidden");
      window.scrollTo(0, 0);

      // Trigger data loading for specific views
      if (viewId === "orders") loadOrders();
      if (viewId === "wishlist") loadWishlist();
      if (viewId === "products") filterProducts();
      if (viewId === "hostels") renderHostelsList();
      if (viewId === "cart") renderCart();
      if (viewId === "settings") updateSettingsUI();
    }
  }
}

function goHome() {
  showView("home");
}

function requireLogin(fn) {
  if (!currentUser) {
    toast("Please login first.", "warning");
    showView("auth");
    return;
  }
  fn();
}

function mobileNav(page) {
  closeMobileMenu();
  if (page === "cart") {
    requireLogin(() => showView("cart"));
    return;
  }
  showView(page);
}

function toggleMobileMenu() {
  document.getElementById("mobile-menu").classList.toggle("open");
}

function closeMobileMenu() {
  document.getElementById("mobile-menu").classList.remove("open");
}

// ============================================================
// AUTH SYSTEM
// ============================================================
function selectRole(role) {
  selectedRole = role;
  document
    .getElementById("tab-customer")
    .classList.toggle("active", role === "customer");
  document
    .getElementById("tab-vendor")
    .classList.toggle("active", role === "vendor");
  document
    .getElementById("reg-business-fields")
    .classList.toggle("hidden", role !== "vendor");
  document.getElementById("reg-role-note").textContent =
    role === "vendor"
      ? "Sell products and services to students on campus. Requires admin verification."
      : "Shopping for products and services on campus.";
}

async function doLogin() {
  const email = document
    .getElementById("login-email")
    .value.trim()
    .toLowerCase();
  const pass = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");

  if (!email || !pass) {
    errEl.textContent = "Please fill in all fields.";
    return;
  }

  try {
    const { data: authData, error: authError } =
      await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (authError) {
      errEl.textContent = "Invalid email or password.";
      return;
    }

    const { data: profile, error: profError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .single();
    if (profError || !profile) {
      errEl.textContent = "Profile not found.";
      await supabaseClient.auth.signOut();
      return;
    }

    if (profile.status === "pending") {
      errEl.innerHTML =
        '<span style="color:var(--gold)">⏳ Your account is pending admin approval.</span>';
      await supabaseClient.auth.signOut();
      return;
    }
    if (profile.status === "rejected") {
      errEl.innerHTML =
        '<span style="color:#FF6B7A">✗ Your account was rejected. Contact support.</span>';
      await supabaseClient.auth.signOut();
      return;
    }

    currentUser = profile;
    updateHeaderUI();
    await mergeCarts();
    errEl.textContent = "";
    document.getElementById("login-email").value = "";
    document.getElementById("login-password").value = "";
    toast("Welcome back, " + profile.full_name + "! 👋", "success");

    if (profile.role === "admin") showView("admin");
    else if (profile.role === "vendor") showView("vendor-dashboard");
    else showView("home");
  } catch (err) {
    console.error(err);
    errEl.textContent = "An unexpected error occurred.";
  }
}

async function doRegister() {
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim().toLowerCase();
  const pass = document.getElementById("reg-password").value;
  const confirm = document.getElementById("reg-confirm").value;
  const bname = document.getElementById("reg-business")?.value.trim();
  const btype = document.getElementById("reg-btype")?.value;
  const phone = document.getElementById("reg-phone")?.value.trim();
  const hall = document.getElementById("reg-hall")?.value.trim();
  const studentId = document.getElementById("reg-student-id")?.value.trim();
  const errEl = document.getElementById("reg-error");

  if (!name || !email || !pass) {
    errEl.textContent = "Please fill in required fields.";
    return;
  }
  if (pass.length < 6) {
    errEl.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (pass !== confirm) {
    errEl.textContent = "Passwords do not match.";
    return;
  }
  if (selectedRole === "vendor" && !bname) {
    errEl.textContent = "Business name is required for vendors.";
    return;
  }

  try {
    const { data: authData, error: authError } =
      await supabaseClient.auth.signUp({
        email,
        password: pass,
        options: { data: { full_name: name, role: selectedRole } },
      });

    if (authError) {
      errEl.textContent = authError.message;
      return;
    }

    const profileData = {
      id: authData.user.id,
      full_name: name,
      email: email,
      role: selectedRole,
      phone: phone || "",
      student_id: studentId || "",
      hall: hall || "",
      business_name: bname || null,
      business_type: btype || null,
      status: "pending",
      verified: false,
      created_at: new Date().toISOString(),
    };

    const { error: profError } = await supabase
      .from("profiles")
      .insert(profileData);
    if (profError) {
      errEl.textContent = "Error creating profile.";
      return;
    }

    errEl.textContent = "";
    document.getElementById("reg-pending").classList.remove("hidden");
    [
      "reg-name",
      "reg-email",
      "reg-password",
      "reg-confirm",
      "reg-business",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    toast("Account created! Awaiting admin approval.", "success");
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error(err);
    errEl.textContent = "An unexpected error occurred.";
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  updateHeaderUI();
  toast("Logged out successfully.");
  showView("auth");
}

function updateHeaderUI() {
  const loggedIn = !!currentUser;
  const isAdmin = loggedIn && currentUser.role === "admin";
  document.getElementById("welcome-msg").classList.toggle("hidden", !loggedIn);
  document.getElementById("logout-btn").classList.toggle("hidden", !loggedIn);
  document.getElementById("nav-auth").classList.toggle("hidden", loggedIn);
  document.getElementById("nav-admin").classList.toggle("hidden", !isAdmin);
  document.getElementById("mnav-auth").classList.toggle("hidden", loggedIn);
  document.getElementById("mnav-admin").classList.toggle("hidden", !isAdmin);
  document.getElementById("mlogout-btn").classList.toggle("hidden", !loggedIn);
  if (loggedIn) {
    const badge =
      currentUser.role === "vendor" && currentUser.verified
        ? ' <span class="verified-badge">VERIFIED</span>'
        : "";
    document.getElementById("welcome-msg").innerHTML =
      "Hi, " + currentUser.full_name + badge;
  }
}

// ============================================================
// CART & WISHLIST (SUPABASE SYNC)
// ============================================================
async function getCart() {
  if (!currentUser) {
    return DB.get("guestCart") || [];
  }
  const { data, error } = await supabase
    .from("cart_items")
    .select("product_id, quantity")
    .eq("user_id", currentUser.id);
  return data || [];
}

async function saveCart(cart) {
  if (!currentUser) {
    DB.set("guestCart", cart);
  } else {
    // Delete all and re-insert for simplicity in this prototype
    await supabaseClient
      .from("cart_items")
      .delete()
      .eq("user_id", currentUser.id);
    const inserts = cart.map((item) => ({
      user_id: currentUser.id,
      product_id: item.productId,
      quantity: item.qty,
    }));
    await supabaseClient.from("cart_items").insert(inserts);
  }
  updateCartBadge();
}

async function mergeCarts() {
  const guestCart = DB.get("guestCart") || [];
  if (guestCart.length === 0) return;

  const userCart = await getCart();
  guestCart.forEach((guestItem) => {
    const existing = userCart.find(
      (uItem) => uItem.productId === guestItem.productId,
    );
    if (existing) existing.qty += guestItem.qty;
    else userCart.push(guestItem);
  });

  await saveCart(userCart);
  DB.del("guestCart");
  toast("Guest cart items merged! 🛒", "success");
}

async function addToCart(productId) {
  const cart = await getCart();
  const existing = cart.find((item) => item.productId === productId);
  if (existing) existing.qty += 1;
  else cart.push({ productId, qty: 1 });
  await saveCart(cart);
  toast("Added to cart! 🛒", "success");
}

async function updateCartBadge() {
  const cart = await getCart();
  const count = cart.reduce((s, i) => s + (i.qty || i.quantity || 0), 0);
  ["cart-badge", "cart-badge-mobile"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  });
}

// ============================================================
// PRODUCTS & MARKETPLACE
// ============================================================
const CATEGORY_ICONS = {
  Fashion: "👗",
  Electronics: "💻",
  Food: "🍽️",
  Services: "🛠️",
  Hostels: "🏠",
};
const CATEGORY_IMGS = {
  Fashion:
    "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=400&q=80",
  Electronics:
    "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&q=80",
  Food: "https://images.unsplash.com/photo-150467490024?w=400&q=80",
  Services: "https://images.unsplash.com/photo-145416580460?w=400&q=80",
  Hostels:
    "https://images.unsplash.com/photo-1555854875-85936e0d7316?w=400&q=80",
};

async function renderFeaturedProducts() {
  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("featured", true)
    .limit(4);
  if (error) return;
  document.getElementById("featured-products").innerHTML = products
    .map((p) => productCardHTML(p))
    .join("");
}

async function filterProducts() {
  const cat = document.getElementById("filter-category").value;
  const sort = document.getElementById("filter-sort").value;
  const search = document.getElementById("filter-search").value.toLowerCase();

  let query = supabaseClient.from("products").select("*");

  if (cat) query = query.eq("category", cat);

  const { data: products, error } = await query;
  if (error) return;

  let filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search) ||
      p.description.toLowerCase().includes(search),
  );

  if (sort === "price-asc") filtered.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") filtered.sort((a, b) => b.price - a.price);
  else if (sort === "name")
    filtered.sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById("products-list").innerHTML = filtered.length
    ? filtered.map((p) => productCardHTML(p)).join("")
    : '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--dove);">No products found matching your search.</div>';
}

function productCardHTML(p) {
  const imgContent = p.image_url
    ? `<img src="${p.image_url}" alt="${p.name}" loading="lazy">`
    : `<div class="no-img">${CATEGORY_ICONS[p.category] || "📦"}</div>`;
  const isService = p.type === "service";
  const apptBtn = isService
    ? `<button class="btn btn-outline btn-sm" onclick="bookAppointment('${p.id}')">BOOK</button>`
    : "";

  return `<div class="product-card">
    <div class="product-img">
      ${imgContent}
      <span class="product-badge">${p.category}</span>
      <button class="wishlist-btn" onclick="addToWishlist('${p.id}')">❤️</button>
    </div>
    <div class="product-info">
      <div class="product-category-tag">${p.category.toUpperCase()}</div>
      <div class="product-name">${p.name}</div>
      <div class="product-vendor">by ${p.vendor_name}</div>
      <div class="product-desc">${p.description.substring(0, 80)}${p.description.length > 80 ? "..." : ""}</div>
      <div class="product-price">GH₵ ${p.price.toFixed(2)}</div>
      <div class="product-actions">
        <button class="btn btn-outline btn-sm" onclick="viewProduct('${p.id}')">VIEW</button>
        ${apptBtn}
        <button class="btn btn-red btn-sm" onclick="addToCart('${p.id}')">ADD TO CART</button>
      </div>
    </div>
  </div>`;
}

async function viewProduct(id) {
  const { data: p, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !p) return;

  currentDetailProduct = p;
  currentDetailQty = 1;

  const imgHtml = p.image_url
    ? `<img src="${p.image_url}" alt="${p.name}" style="width:100%; height:250px; object-fit:cover; border-radius:12px; margin-bottom:20px;">`
    : `<div style="width:100%; height:250px; background:var(--black-mid); border-radius:12px; margin-bottom:20px; display:flex; align-items:center; justify-content:center; font-size:60px;">${CATEGORY_ICONS[p.category] || "📦"}</div>`;

  document.getElementById("modal-content").innerHTML = `
    <div class="modal-title">${p.name}</div>
    ${imgHtml}
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
      <span style="color:var(--gold); font-family:var(--font-accent); letter-spacing:1px; font-size:13px;">${p.category.toUpperCase()}</span>
      <span style="font-family:var(--font-display); font-size:24px; color:var(--red); font-weight:700;">GH₵ ${p.price.toFixed(2)}</span>
    </div>
    <div style="color:var(--dove); font-size:14px; margin-bottom:20px; line-height:1.6;">${p.description}</div>
    <div style="font-size:13px; color:var(--dove-light); margin-bottom:20px;">Sold by ${p.vendor_name}</div>
    <div style="display:flex; align-items:center; gap:15px; margin-bottom:24px;">
      <span style="font-size:14px; color:var(--white);">Quantity:</span>
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="btn btn-outline btn-sm" onclick="changeDetailQty(-1)">−</button>
        <span id="detail-qty" style="min-width:20px; text-align:center; color:var(--white);">1</span>
        <button class="btn btn-outline btn-sm" onclick="changeDetailQty(1)">+</button>
      </div>
    </div>
    <div style="display:flex; gap:10px;">
      ${p.type === "service" ? `<button class="btn btn-gold" style="flex:1;" onclick="bookAppointment('${p.id}')">BOOK NOW</button>` : ""}
      <button class="btn btn-red" style="flex:1;" onclick="addToCartQty('${p.id}')">ADD TO CART</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function changeDetailQty(delta) {
  currentDetailQty = Math.max(1, currentDetailQty + delta);
  document.getElementById("detail-qty").textContent = currentDetailQty;
}

async function addToCartQty(id) {
  for (let i = 0; i < currentDetailQty; i++) await addToCart(id);
  toast("Added " + currentDetailQty + " item(s) to cart! 🛒", "success");
}

// ============================================================
// TOAST & UTILS
// ============================================================
function toast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = type ? "show " + type : "show";
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    el.className = "";
  }, 3500);
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

// ============================================================
// HOSTELS SYSTEM
// ============================================================
async function renderHostelsList() {
  const { data: hostels, error } = await supabase
    .from("hostels_listings")
    .select("*");
  if (error) return;

  document.getElementById("hostels-list").innerHTML = hostels.length
    ? hostels.map((h) => hostelCardHTML(h)).join("")
    : '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--dove);">No hostels available at the moment.</div>';
}

function hostelCardHTML(h) {
  const imgContent = h.image_url
    ? `<img src="${h.image_url}" alt="${h.name}" loading="lazy">`
    : `<div class="no-img">${CATEGORY_ICONS.Hostels}</div>`;

  return `<div class="product-card">
    <div class="product-img">
      ${imgContent}
      <span class="product-badge">${h.room_type}</span>
    </div>
    <div class="product-info">
      <div class="product-category-tag">HOSTEL</div>
      <div class="product-name">${h.name}</div>
      <div class="product-vendor">Location: ${h.location}</div>
      <div class="product-desc">${h.description.substring(0, 80)}${h.description.length > 80 ? "..." : ""}</div>
      <div class="product-price">GH₵ ${h.price.toFixed(2)} <span style="font-size:11px; color:var(--dove);">/month</span></div>
      <div class="product-actions">
        <button class="btn btn-outline btn-sm" onclick="viewHostel('${h.id}')">DETAILS</button>
        <button class="btn btn-red btn-sm" onclick="requestViewing('${h.id}')">REQUEST VIEWING</button>
      </div>
    </div>
  </div>`;
}

async function viewHostel(id) {
  const { data: h, error } = await supabase
    .from("hostels_listings")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !h) return;

  const imgHtml = h.image_url
    ? `<img src="${h.image_url}" alt="${h.name}" style="width:100%; height:300px; object-fit:cover; border-radius:12px; margin-bottom:20px;">`
    : `<div style="width:100%; height:300px; background:var(--black-mid); border-radius:12px; margin-bottom:20px; display:flex; align-items:center; justify-content:center; font-size:60px;">${CATEGORY_ICONS.Hostels}</div>`;

  document.getElementById("hostel-detail-content").innerHTML = `
    <div class="modal-title">${h.name}</div>
    ${imgHtml}
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
      <span style="color:var(--gold); font-family:var(--font-accent); letter-spacing:1px; font-size:13px;">${h.room_type.toUpperCase()}</span>
      <span style="font-family:var(--font-display); font-size:24px; color:var(--red); font-weight:700;">GH₵ ${h.price.toFixed(2)} / mo</span>
    </div>
    <div style="color:var(--dove); font-size:14px; margin-bottom:20px; line-height:1.6;">${h.description}</div>
    <div style="font-size:13px; color:var(--dove-light); margin-bottom:20px;">📍 ${h.location}</div>
    <div style="display:flex; gap:10px;">
      <button class="btn btn-red" style="flex:1;" onclick="requestViewing('${h.id}')">REQUEST VIEWING</button>
      <button class="btn btn-outline" style="flex:1;" onclick="showView('hostels')">BACK</button>
    </div>
  `;
  showView("hostels-detail");
}

async function requestViewing(id) {
  requireLogin(async () => {
    const { error } = await supabaseClient.from("appointments").insert({
      user_id: currentUser.id,
      listing_id: id,
      type: "viewing",
      status: "pending",
    });

    if (error) {
      toast("Error requesting viewing.", "error");
    } else {
      toast("Viewing request sent! 🏠", "success");
    }
  });
}

function updateSettingsUI() {
  if (!currentUser) return;
  document.getElementById("settings-user-name").textContent =
    currentUser.full_name;
  document.getElementById("settings-user-email").textContent =
    currentUser.email;
  document.getElementById("settings-user-role").textContent =
    currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
  document.getElementById("settings-user-status").textContent =
    currentUser.status.charAt(0).toUpperCase() + currentUser.status.slice(1);
  document.getElementById("settings-user-status").className =
    "status-badge " + currentUser.status;
  document.getElementById("user-edit-name").value = currentUser.full_name;
  document.getElementById("user-edit-email").value = currentUser.email;
}

async function updateUserSettings() {
  const newName = document.getElementById("user-edit-name").value.trim();
  const newEmail = document
    .getElementById("user-edit-email")
    .value.trim()
    .toLowerCase();

  if (!newName || !newEmail) {
    toast("Name and Email are required.", "error");
    return;
  }

  try {
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: newName,
        email: newEmail,
      })
      .eq("id", currentUser.id);

    if (error) throw error;

    currentUser.full_name = newName;
    currentUser.email = newEmail;
    updateSettingsUI();
    updateHeaderUI();
    toast("Profile updated successfully!", "success");
  } catch (err) {
    console.error(err);
    toast("Update failed: " + err.message, "error");
  }
}

async function placeOrder() {
  requireLogin(async () => {
    const name = document.getElementById("ch-name").value.trim();
    const phone = document.getElementById("ch-phone").value.trim();
    const address = document.getElementById("ch-address").value.trim();
    const payment = document.querySelector(
      'input[name="payment"]:checked',
    )?.value;

    if (!name || !phone || !address) {
      toast("Please fill in all delivery details.", "error");
      return;
    }

    const cart = await getCart();
    if (cart.length === 0) {
      toast("Your cart is empty.", "error");
      return;
    }

    try {
      // 1. Create Order
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          user_id: currentUser.id,
          customer_name: name,
          customer_phone: phone,
          delivery_address: address,
          payment_method: payment,
          status: "pending",
          total_amount: parseFloat(
            document
              .getElementById("cart-total-display")
              .textContent.replace("GH₵ ", ""),
          ),
        })
        .select()
        .single();

      if (orderErr) throw orderErr;

      // 2. Create Order Items
      const items = cart.map((item) => ({
        order_id: order.id,
        product_id: item.productId || item.product_id,
        quantity: item.qty || item.quantity,
        price: 0, // In a real app, we'd fetch current price here
      }));
      const { error: itemsErr } = await supabase
        .from("order_items")
        .insert(items);
      if (itemsErr) throw itemsErr;

      // 3. Clear Cart
      await saveCart([]);

      // 4. UI Update
      document.getElementById("checkout-form-view").classList.add("hidden");
      document.getElementById("success-screen").classList.remove("hidden");
      document.getElementById("order-num").textContent =
        "#" + order.id.substring(0, 8).toUpperCase();
      toast("Order placed successfully!", "success");
    } catch (err) {
      console.error(err);
      toast("Checkout failed: " + err.message, "error");
    }
  });
}

// ============================================================
// CART VIEW LOGIC
// ============================================================
async function renderCart() {
  const cart = await getCart();
  const container = document.getElementById("cart-items-container");

  if (cart.length === 0) {
    container.innerHTML =
      '<div style="text-align:center; padding:40px; color:var(--dove);">Your cart is empty.</div>';
    updateCartTotals(0);
    return;
  }

  let total = 0;
  let html = "";

  for (const item of cart) {
    const { data: p } = await supabase
      .from("products")
      .select("*")
      .eq("id", item.productId || item.product_id)
      .single();
    if (!p) continue;

    const subtotal = p.price * (item.qty || item.quantity);
    total += subtotal;

    html += `<div class="cart-item" style="display:flex; align-items:center; gap:15px; padding:15px 0; border-bottom:1px solid rgba(255,255,255,0.1);">
      <img src="${p.image_url || ""}" alt="${p.name}" style="width:60px; height:60px; border-radius:8px; object-fit:cover;">
      <div style="flex:1;">
        <div style="color:var(--white); font-weight:600;">${p.name}</div>
        <div style="color:var(--dove); font-size:12px;">GH₵ ${p.price.toFixed(2)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="btn btn-outline btn-sm" onclick="changeCartQty('${item.productId || item.product_id}', -1)">−</button>
        <span style="color:var(--white); min-width:20px; text-align:center;">${item.qty || item.quantity}</span>
        <button class="btn btn-outline btn-sm" onclick="changeCartQty('${item.productId || item.product_id}', 1)">+</button>
      </div>
      <div style="color:var(--white); font-weight:600; min-width:80px; text-align:right;">GH₵ ${subtotal.toFixed(2)}</div>
    </div>`;
  }

  container.innerHTML = html;
  updateCartTotals(total);
}

async function changeCartQty(id, delta) {
  const cart = await getCart();
  const item = cart.find((i) => (i.productId || i.product_id) === id);
  if (!item) return;

  const qty = (item.qty || item.quantity) + delta;
  if (qty <= 0) {
    const filtered = cart.filter((i) => (i.productId || i.product_id) !== id);
    await saveCart(filtered);
  } else {
    if (item.qty !== undefined) item.qty = qty;
    else item.quantity = qty;
    await saveCart(cart);
  }
  renderCart();
}

function updateCartTotals(subtotal) {
  const delivery = subtotal > 0 ? 5.0 : 0;
  const total = subtotal + delivery;
  document.getElementById("cart-subtotal").textContent =
    `GH₵ ${subtotal.toFixed(2)}`;
  document.getElementById("cart-item-count").textContent =
    document.getElementById("cart-items-container").children.length;
  document.getElementById("cart-total-display").textContent =
    `GH₵ ${total.toFixed(2)}`;
  document.getElementById("checkout-total").textContent =
    `GH₵ ${total.toFixed(2)}`;
}

async function clearCart() {
  if (!confirm("Clear your entire cart?")) return;
  await saveCart([]);
  renderCart();
}

// ============================================================
// ADMIN SYSTEM
// ============================================================
function adminPanel(panelId) {
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("visible"));
  document.getElementById("ap-" + panelId).classList.add("visible");

  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  document.getElementById("apnav-" + panelId).classList.add("active");

  if (panelId === "overview") adminGetStats();
  if (panelId === "users") adminLoadUsers();
  if (panelId === "products") adminLoadProducts();
  if (panelId === "orders") adminLoadOrders();
  if (panelId === "audit") adminLoadAuditLog();
}

async function adminGetStats() {
  const { count: uCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: false });
  const { count: pCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: false });
  const { count: oCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: false });

  document.getElementById("admin-stats").innerHTML = `
    <div class="stat-card"><h3>Users</h3><div class="stat-val">${uCount || 0}</div></div>
    <div class="stat-card"><h3>Products</h3><div class="stat-val">${pCount || 0}</div></div>
    <div class="stat-card"><h3>Orders</h3><div class="stat-val">${oCount || 0}</div></div>
  `;
}

async function adminLoadUsers() {
  const { data: users, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return;

  const tbody = document.getElementById("users-table-body");
  tbody.innerHTML = users
    .map(
      (u) => `
    <tr>
      <td>${u.full_name}</td>
      <td>${u.email}</td>
      <td>${u.role}</td>
      <td>${u.business_name || "N/A"}</td>
      <td><span class="status-badge ${u.status}">${u.status}</span></td>
      <td>
        ${
          u.status === "pending"
            ? `
          <button class="btn btn-outline btn-sm" onclick="updateUserStatus('${u.id}', 'approved')">✅</button>
          <button class="btn btn-outline btn-sm" onclick="updateUserStatus('${u.id}', 'rejected')">❌</button>
        `
            : `<button class="btn btn-outline btn-sm" onclick="updateUserStatus('${u.id}', 'pending')">🔄</button>`
        }
      </td>
    </tr>
  `,
    )
    .join("");
}

async function updateUserStatus(id, status) {
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", id);
  if (error) {
    toast("Update failed.", "error");
  } else {
    toast("User status updated to " + status, "success");
    adminLoadUsers();
  }
}

async function adminLoadProducts() {
  const { data: prods, error } = await supabaseClient
    .from("products")
    .select("*");
  if (error) return;

  document.getElementById("products-table-body").innerHTML = prods
    .map(
      (p) => `
    <tr>
      <td>${p.name}</td>
      <td>${p.category}</td>
      <td>GH₵ ${p.price.toFixed(2)}</td>
      <td>${p.vendor_name}</td>
      <td>${p.type}</td>
      <td><button class="btn btn-outline btn-sm" onclick="deleteProduct('${p.id}')">🗑️</button></td>
    </tr>
  `,
    )
    .join("");
}

async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  const { error } = await supabaseClient.from("products").delete().eq("id", id);
  if (error) toast("Delete failed.", "error");
  else {
    toast("Product deleted.", "success");
    adminLoadProducts();
  }
}

async function adminAddProduct() {
  const name = document.getElementById("ap-prod-name").value.trim();
  const cat = document.getElementById("ap-prod-cat").value;
  const price = parseFloat(document.getElementById("ap-prod-price").value);
  const type = document.getElementById("ap-prod-type").value;
  const vendor = document.getElementById("ap-prod-vendor").value;
  const desc = document.getElementById("ap-prod-desc").value.trim();
  const img = document.getElementById("ap-prod-img").value.trim();
  const msgEl = document.getElementById("ap-prod-msg");

  if (!name || !cat || isNaN(price)) {
    msgEl.textContent = "Missing required fields.";
    return;
  }

  const { error } = await supabaseClient.from("products").insert({
    name,
    category: cat,
    price,
    type,
    vendor_name: vendor,
    description: desc,
    image_url: img,
    featured: false,
  });

  if (error) {
    msgEl.textContent = "Error: " + error.message;
  } else {
    msgEl.textContent = "Product added successfully!";
    clearProductForm();
    toast("Product listed!", "success");
  }
}

function clearProductForm() {
  ["ap-prod-name", "ap-prod-price", "ap-prod-img", "ap-prod-desc"].forEach(
    (id) => {
      document.getElementById(id).value = "";
    },
  );
}

async function saveSettings() {
  const tagline = document.getElementById("settings-tagline").value;
  const { error } = await supabaseClient
    .from("site_settings")
    .upsert({ tagline });
  if (error) toast("Save failed.", "error");
  else {
    document.getElementById("site-tagline").textContent = tagline;
    toast("Settings saved!", "success");
  }
}

async function adminLoadOrders() {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return;

  document.getElementById("orders-table-body").innerHTML = orders
    .map(
      (o) => `
    <tr>
      <td>${o.id.substring(0, 6)}</td>
      <td>${o.customer_name}</td>
      <td>-</td>
      <td>GH₵ ${o.total_amount.toFixed(2)}</td>
      <td>${o.payment_method}</td>
      <td>${new Date(o.created_at).toLocaleDateString()}</td>
      <td><span class="status-badge ${o.status}">${o.status}</span></td>
    </tr>
  `,
    )
    .join("");
}

// ============================================================
// VENDOR SYSTEM
// ============================================================
function vendorPanel(panelId) {
  document
    .querySelectorAll(".admin-panel")
    .forEach((p) => p.classList.remove("visible"));
  document.getElementById("v-" + panelId).classList.add("visible");

  document
    .querySelectorAll(".admin-nav-item")
    .forEach((n) => n.classList.remove("active"));
  document.getElementById("vnav-" + panelId).classList.add("active");

  if (panelId === "overview") vendorLoadOverview();
  if (panelId === "products") vendorLoadProducts();
  if (panelId === "orders") vendorLoadOrders();
  if (panelId === "appointments") vendorLoadAppointments();
  if (panelId === "reviews") vendorLoadReviews();
  if (panelId === "profile") vendorLoadProfile();
}

async function vendorLoadOverview() {
  const { data: prods } = await supabase
    .from("products")
    .select("*")
    .eq("vendor_id", currentUser.id);
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("vendor_id", currentUser.id);

  document.getElementById("v-overview").innerHTML = `
    <div class="page-title">Business Overview</div>
    <div class="stats-grid">
      <div class="stat-card"><h3>Active Listings</h3><div class="stat-val">${prods?.length || 0}</div></div>
      <div class="stat-card"><h3>Total Orders</h3><div class="stat-val">${orders?.length || 0}</div></div>
      <div class="stat-card"><h3>Verification</h3><div class="stat-val">${currentUser.verified ? "YES" : "NO"}</div></div>
    </div>
  `;
}

async function vendorLoadProducts() {
  const { data: prods, error } = await supabase
    .from("products")
    .select("*")
    .eq("vendor_id", currentUser.id);
  if (error) return;

  document.getElementById("v-products").innerHTML = `
    <div class="page-title">My Listings</div>
    <div class="products-grid">
      ${prods.length ? prods.map((p) => productCardHTML(p)).join("") : "<p>No products listed yet.</p>"}
    </div>
  `;
}

async function vendorLoadOrders() {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("vendor_id", currentUser.id);
  if (error) return;

  document.getElementById("v-orders").innerHTML = `
    <div class="page-title">My Orders</div>
    <table class="table">
      <thead><tr><th>Order ID</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>
        ${orders.map((o) => `<tr><td>${o.id.substring(0, 8)}</td><td>${o.customer_name}</td><td>GH₵ ${o.total_amount.toFixed(2)}</td><td>${o.status}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

async function vendorLoadAppointments() {
  const { data: appts, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("vendor_id", currentUser.id);
  if (error) return;

  document.getElementById("v-appointments").innerHTML = `
    <div class="page-title">Appointments & Viewings</div>
    <div class="orders-grid">
      ${appts
        .map(
          (a) => `<div class="order-card">
        <div class="order-header"><strong>${a.type === "viewing" ? "Viewing" : "Booking"}</strong></div>
        <div class="order-detail">User ID: ${a.user_id.substring(0, 8)}</div>
        <div class="order-status">${a.status}</div>
      </div>`,
        )
        .join("")}
    </div>
  `;
}

async function vendorLoadReviews() {
  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("vendor_id", currentUser.id);
  if (error) return;
  document.getElementById("v-reviews").innerHTML =
    `<div class="page-title">Customer Reviews</div>` +
    (reviews.length
      ? reviews
          .map(
            (r) =>
              `<div class="review-card"><strong>${r.user_name}</strong>: ${r.comment} ⭐${r.rating}</div>`,
          )
          .join("")
      : "<p>No reviews yet.</p>");
}

async function vendorLoadProfile() {
  document.getElementById("v-profile").innerHTML = `
    <div class="page-title">Business Profile</div>
    <div class="form">
      <div class="group"><label>BUSINESS NAME</label><input type="text" id="v-edit-bname" value="${currentUser.business_name || ""}"></div>
      <div class="group"><label>BUSINESS TYPE</label><input type="text" id="v-edit-btype" value="${currentUser.business_type || ""}"></div>
      <button class="btn btn-gold" onclick="updateVendorProfile()">SAVE PROFILE</button>
    </div>
  `;
}

async function updateVendorProfile() {
  const bname = document.getElementById("v-edit-bname").value.trim();
  const btype = document.getElementById("v-edit-btype").value.trim();

  const { error } = await supabase
    .from("profiles")
    .update({
      business_name: bname,
      business_type: btype,
    })
    .eq("id", currentUser.id);

  if (error) {
    toast("Update failed.", "error");
  } else {
    currentUser.business_name = bname;
    currentUser.business_type = btype;
    toast("Profile updated!", "success");
  }
}

// ============================================================
// USER UTILITIES
// ============================================================
async function loadOrders() {
  requireLogin(async () => {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });
    if (error) return;

    document.getElementById("orders-list").innerHTML = orders.length
      ? orders
          .map(
            (o) => `
        <div class="order-card">
          <div class="order-header">
            <strong>Order #${o.id.substring(0, 8).toUpperCase()}</strong>
            <span class="status-badge ${o.status}">${o.status}</span>
          </div>
          <div class="order-detail">Date: ${new Date(o.created_at).toLocaleDateString()}</div>
          <div class="order-detail">Total: GH₵ ${o.total_amount.toFixed(2)}</div>
          <div class="order-detail">Payment: ${o.payment_method}</div>
          <button class="btn btn-outline btn-sm" style="width:100%; margin-top:10px;" onclick="viewOrderDetails('${o.id}')">VIEW DETAILS</button>
        </div>
      `,
          )
          .join("")
      : '<p style="text-align:center; color:var(--dove);">No orders found.</p>';
  });
}

async function loadWishlist() {
  requireLogin(async () => {
    const { data: items, error } = await supabase
      .from("wishlist_items")
      .select("product_id")
      .eq("user_id", currentUser.id);
    if (error) return;

    const grid = document.getElementById("wishlist-grid");
    if (!items || items.length === 0) {
      grid.innerHTML =
        '<p style="text-align:center; color:var(--dove);">Your wishlist is empty.</p>';
      return;
    }

    const products = [];
    for (const item of items) {
      const { data: p } = await supabase
        .from("products")
        .select("*")
        .eq("id", item.product_id)
        .single();
      if (p) products.push(p);
    }

    grid.innerHTML = products.map((p) => productCardHTML(p)).join("");
  });
}

async function bookAppointment(productId) {
  requireLogin(async () => {
    const date = prompt("Enter preferred date and time (e.g., Monday 2pm):");
    if (!date) return;

    const { data: p } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    const { error } = await supabaseClient.from("appointments").insert({
      user_id: currentUser.id,
      product_id: productId,
      vendor_id: p.vendor_id,
      appointment_date: date,
      status: "pending",
    });

    if (error) {
      toast("Booking failed.", "error");
    } else {
      toast("Appointment requested! 📅", "success");
    }
  });
}

async function submitReview(listingId, type = "product") {
  requireLogin(async () => {
    const rating = prompt("Rate from 1 to 5:", "5");
    const comment = prompt("Your review:");

    if (!rating || !comment) return;

    const { error } = await supabaseClient.from("reviews").insert({
      user_id: currentUser.id,
      listing_id: listingId,
      listing_type: type,
      rating: parseInt(rating),
      comment: comment,
      user_name: currentUser.full_name,
    });

    if (error) {
      toast("Review failed.", "error");
    } else {
      toast("Review submitted! ⭐", "success");
    }
  });
}

async function logAdminAction(action) {
  await supabaseClient.from("audit_log").insert({
    admin_id: currentUser.id,
    action: action,
    timestamp: new Date().toISOString(),
  });
}

async function adminLoadAuditLog() {
  const { data: logs, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("timestamp", { ascending: false });
  if (error) return;

  document.getElementById("ap-audit").innerHTML = `
    <div class="page-title">Site Audit Log</div>
    <table class="table">
      <thead><tr><th>Timestamp</th><th>Admin</th><th>Action</th></tr></thead>
      <tbody>
        ${logs.map((l) => `<tr><td>${new Date(l.timestamp).toLocaleString()}</td><td>${l.admin_id.substring(0, 8)}</td><td>${l.action}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

async function viewOrderDetails(orderId) {
  requireLogin(async () => {
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (error) return;

    const { data: items } = await supabase
      .from("order_items")
      .select("*, products(name, price)")
      .eq("order_id", orderId);

    const html = `
      <div class="modal-title">Order Details #${order.id.substring(0, 8).toUpperCase()}</div>
      <div style="margin-bottom:20px; color:var(--dove); font-size:14px;">
        <p><strong>Customer:</strong> ${order.customer_name}</p>
        <p><strong>Address:</strong> ${order.delivery_address}</p>
        <p><strong>Payment:</strong> ${order.payment_method}</p>
        <p><strong>Status:</strong> ${order.status}</p>
      </div>
      <div style="margin-bottom:20px;">
        <div class="row" style="border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px; font-weight:bold; color:var(--gold);">
          <span>Item</span><span style="width:40px; text-align:center;">Qty</span><span style="text-align:right;">Price</span>
        </div>
        ${items
          .map(
            (i) => `
          <div class="row" style="padding:5px 0; font-size:13px; display:flex; justify-content:space-between;">
            <span>${i.products?.name || "Unknown"}</span>
            <span style="width:40px; text-align:center;">${i.quantity}</span>
            <span style="text-align:right;">GH₵ ${i.price.toFixed(2)}</span>
          </div>
        `,
          )
          .join("")}
      </div>
      <div class="row" style="justify-content:flex-end; font-size:18px; font-weight:bold; color:var(--red);">
        TOTAL: GH₵ ${order.total_amount.toFixed(2)}
      </div>
    `;

    document.getElementById("modal-content").innerHTML = html;
    document.getElementById("modal-overlay").classList.remove("hidden");
  });
}

async function addToWishlist(productId) {
  requireLogin(async () => {
    const { data: items } = await supabase
      .from("wishlist_items")
      .select("*")
      .eq("user_id", currentUser.id);
    const exists = items?.some((i) => i.product_id === productId);

    if (exists) {
      await supabase
        .from("wishlist_items")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("product_id", productId);
      toast("Removed from wishlist 💔", "info");
    } else {
      const { error } = await supabaseClient.from("wishlist_items").insert({
        user_id: currentUser.id,
        product_id: productId,
      });
      if (error) toast("Error adding to wishlist", "error");
      else toast("Added to wishlist! ❤️", "success");
    }
    if (
      document.getElementById("view-wishlist").classList.contains("hidden") ===
      false
    ) {
      loadWishlist();
    }
  });
}
