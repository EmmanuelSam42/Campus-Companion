// ===============================
// SUPABASE SETUP
// ===============================

const SUPABASE_URL = "https://dhidvacvupjihqnzwdik.supabase.co";

const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoaWR2YWN2dXBqaWhxbnp3ZGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzY1ODcsImV4cCI6MjA5MzY1MjU4N30.190oSwDZuLEfpjkvVqG7tL4dG9iHvxBU2YHk-Zg_z9Y";

const client = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ===============================
// AUTH SLIDER
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  const authCard = document.getElementById("auth-card");

  const goRegister = document.getElementById("go-register");
  const goLogin = document.getElementById("go-login");

  goRegister.addEventListener("click", () => {
    authCard.classList.add("register-mode");
  });

  goLogin.addEventListener("click", () => {
    authCard.classList.remove("register-mode");
  });
});

// ===============================
// LOGIN
// ===============================

document
  .getElementById("login-btn")
  .addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();

    const password = document
      .getElementById("password")
      .value.trim();

    // validation
    if (!email || !password) {
      alert("Please fill in all fields");
      return;
    }

    // login
    const { data, error } =
      await client.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      alert(error.message);
      console.error(error);
      return;
    }

    alert("Login successful 🎉");

    console.log(data);

    // redirect
    redirectTo("home");
  });

// ===============================
// REGISTER
// ===============================

document
  .getElementById("register-btn")
  .addEventListener("click", async () => {
    const fullName = document
      .getElementById("full-name")
      .value.trim();

    const email = document
      .getElementById("reg-email")
      .value.trim();

    const password = document
      .getElementById("reg-password")
      .value.trim();

    const confirmPassword = document
      .getElementById("confirm-password")
      .value.trim();

    const role = document
      .getElementById("role")
      .value;

    const phone = document
      .getElementById("phone")
      .value.trim();

    const hall = document
      .getElementById("hall")
      .value.trim();

    const studentId = document
      .getElementById("student-id-reg")
      .value.trim();

    // validation
    if (
      !fullName ||
      !email ||
      !password ||
      !confirmPassword
    ) {
      alert("Please fill in all required fields");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    // register user
    const { data, error } =
      await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
            phone: phone,
            hall: hall,
            student_id: studentId,
          },
        },
      });

    if (error) {
      alert(error.message);
      console.error(error);
      return;
    }

    alert(
      "Registration successful 🎉 Check your email for verification."
    );

    console.log(data);

    // switch back to login
    document
      .getElementById("auth-card")
      .classList.remove("register-mode");
  });

// ===============================
// PAGE ROUTING
// ===============================

function redirectTo(page) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));

  document
    .getElementById(page)
    .classList.add("active");
}

//product api
// ===================================
// PRODUCTS API
// ===================================

const PRODUCTS_API =
  "https://kolzsticks.github.io/Free-Ecommerce-Products-Api/main/products.json";

let allProducts = [];

// load products
async function loadProducts() {
  try {
    const response = await fetch(PRODUCTS_API);

    const data = await response.json();

    allProducts = data;

    displayProducts(data);

    console.log("Products loaded:", data);

  } catch (error) {
    console.error("Error loading products:", error);

    document.querySelector(".product-list").innerHTML =
      "<p>Failed to load products.</p>";
  }
}

// display products
function displayProducts(products) {

  const productList =
    document.querySelector(".product-list");

  productList.innerHTML = "";

  products.forEach((product) => {

    const productCard = `
    
      <div class="product-card">

        <img src="${product.image}" 
             alt="${product.name}" />

        <div class="product-info">

          <h3>${product.name}</h3>

          <p class="category">
            ${product.category}
          </p>

          <p class="description">
            ${product.description.substring(0, 80)}...
          </p>

          <div class="product-bottom">

            <span class="price">
              $${(product.priceCents / 100).toFixed(2)}
            </span>

            <button onclick="addToCart(${product.id})">
              Add to Cart
            </button>

          </div>

        </div>

      </div>
    `;

    productList.innerHTML += productCard;
  });
}

// load automatically
loadProducts();