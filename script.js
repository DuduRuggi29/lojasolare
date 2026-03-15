// Mobile Menu Toggle
window.toggleMobileMenu = function() {
    console.log('Toggle Menu Triggered');
    const nav = document.getElementById('main-nav');
    const overlay = document.getElementById('menu-overlay');
    
    if (!nav || !overlay) return;
    
    nav.classList.toggle('active');
    overlay.classList.toggle('active');
    
    // Toggle body scroll
    if (nav.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = 'auto';
    }
}

// Image Gallery Update
function updateMainImage(src, element) {
    const mainImg = document.getElementById('variant-image');
    mainImg.src = src;
    
    // Update active thumbnail
    document.querySelectorAll('.thumb').forEach(thumb => {
        thumb.classList.remove('active');
    });
    element.classList.add('active');
}

// Variant Selection Logic
function selectVariant(element, type) {
    // Update UI active state
    const parent = element.parentElement;
    parent.querySelectorAll('.variant-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    element.classList.add('active');

    // Update image if it's light color
    if (type === 'light') {
        const val = element.getAttribute('data-value');
        currentSelectedLight = val;
        if (val === 'warm') {
            updateMainImage('luminaria-warm.png', document.querySelector('.thumb:nth-child(1)'));
        } else {
            updateMainImage('luminaria-white.png', document.querySelector('.thumb:nth-child(2)'));
        }
    }
}

// Current globally selected price for dropdown use
let currentSelectedPrice = 8.00;
let currentSelectedQty = 1;
let currentSelectedOldPrice = 15.00;
let currentSelectedLight = 'warm';

// Wire "Comprar Agora" button to checkout page
document.addEventListener('DOMContentLoaded', () => {
    const checkoutBtn = document.querySelector('.btn-checkout');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            const params = new URLSearchParams({
                qty: currentSelectedQty,
                price: currentSelectedPrice,
                oldPrice: currentSelectedOldPrice,
                light: currentSelectedLight,
            });
            window.location.href = `checkout.html?${params.toString()}`;
        });
    }
});

// Quantity and Price Logic
window.updatePricing = function(qty, price, oldPrice, element) {
    console.log('Updating pricing:', qty, price, oldPrice);
    currentSelectedPrice = price;
    currentSelectedQty = qty;
    currentSelectedOldPrice = oldPrice;

    // Update UI active state for cards
    document.querySelectorAll('.qty-card').forEach(card => {
        card.classList.remove('active');
    });
    if (element) element.classList.add('active');

    // Calculate Values
    const savings = oldPrice - price;
    const discountPercent = Math.round((savings / oldPrice) * 100);

    // Update Price Display
    const priceDisplay = document.getElementById('display-price');
    const originalDisplay = document.getElementById('original-price');
    const instDisplay = document.getElementById('inst-price');
    const discountBadge = document.getElementById('discount-badge');
    const savingsBadge = document.getElementById('savings-badge');
    const pixDisplay = document.getElementById('pix-price');
    
    if (priceDisplay) priceDisplay.innerText = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (originalDisplay) originalDisplay.innerText = oldPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (instDisplay) instDisplay.innerText = (price / 12).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (discountBadge) discountBadge.innerText = `↓ ${discountPercent}%`;
    if (savingsBadge) savingsBadge.innerText = `${savings.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de desconto`;
    
    // Pix Calculation (5% OFF)
    if (pixDisplay) {
        const pixPrice = price * 0.95;
        pixDisplay.innerText = pixPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Refresh table if open
    const dropdown = document.getElementById('installments-dropdown');
    if (dropdown && dropdown.classList.contains('active')) {
        generateInstallmentTable(price);
    }
}

window.toggleInstallmentDropdown = function() {
    const dropdown = document.getElementById('installments-dropdown');
    const btn = document.getElementById('toggle-inst-btn');
    
    if (!dropdown || !btn) return;

    if (dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
        btn.innerHTML = 'Ver opções de pagamento <i class="fas fa-chevron-down"></i>';
    } else {
        generateInstallmentTable(currentSelectedPrice);
        dropdown.classList.add('active');
        btn.innerHTML = 'Ocultar opções de pagamento <i class="fas fa-chevron-up"></i>';
    }
}

function generateInstallmentTable(totalPrice) {
    const container = document.getElementById('installments-table-container');
    if (!container) return;
    
    let html = '<div class="inst-grid">';
    for (let i = 1; i <= 12; i++) {
        const instVal = (totalPrice / i).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        html += `
            <div class="inst-row">
                <span class="inst-num">${i}x de</span>
                <span class="inst-val">${instVal}</span>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
}

// Smooth scroll for nav
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// Dynamic Scarcity & Social Proof Logic
document.addEventListener('DOMContentLoaded', () => {
    let stock = 23;
    const stockEl = document.getElementById('stock-count');
    const toastContainer = document.getElementById('purchase-toast-container');

    const names = ['Ana P.', 'Marcelo J.', 'Juliana S.', 'Carla T.', 'Ricardo O.', 'Beatriz L.', 'Marcos V.', 'Fernanda M.'];
    const cities = ['São Paulo', 'Rio de Janeiro', 'Curitiba', 'Belo Horizonte', 'Salvador', 'Fortaleza', 'Porto Alegre', 'Recife'];

    function updateStock() {
        if (stock > 18) {
            stock--;
            if (stockEl) {
                stockEl.classList.add('pulse-anim');
                stockEl.innerText = stock;
                setTimeout(() => stockEl.classList.remove('pulse-anim'), 500);
            }
            showPurchaseToast();
        }
    }

    function showPurchaseToast(qtyOverride = null) {
        if (!toastContainer) return;
        
        const name = names[Math.floor(Math.random() * names.length)];
        const city = cities[Math.floor(Math.random() * cities.length)];
        const qty = qtyOverride || (Math.floor(Math.random() * 3) + 1);

        const toast = document.createElement('div');
        toast.className = 'purchase-toast';
        toast.innerHTML = `
            <div class="toast-icon"><i class="fas fa-shopping-bag"></i></div>
            <div class="toast-content">
                <span class="toast-user">${name} de ${city}</span>
                <span class="toast-msg">Acabou de comprar ${qty} unidade${qty > 1 ? 's' : ''}!</span>
            </div>
        `;

        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('active'), 100);

        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }

    // Specific Stock Logic requested by USER
    // 3s: 23 -> 18
    // 8s: 18 -> 14
    setTimeout(() => {
        stock = 18;
        if (stockEl) {
            stockEl.classList.add('pulse-anim');
            stockEl.innerText = stock;
            setTimeout(() => stockEl.classList.remove('pulse-anim'), 500);
        }
        showPurchaseToast(5); // drop of 5 units
    }, 3000);

    setTimeout(() => {
        stock = 14;
        if (stockEl) {
            stockEl.classList.add('pulse-anim');
            stockEl.innerText = stock;
            setTimeout(() => stockEl.classList.remove('pulse-anim'), 500);
        }
        showPurchaseToast(4); // drop of 4 units
    }, 8000);

    // CardStack Logic
    initCardStack();
});

// CardStack Implementation - Vanilla JS version of the card-stack effect
function initCardStack() {
    const stack = document.getElementById('benefit-card-stack');
    const items = document.querySelectorAll('.card-stack-item');
    const dots = document.querySelectorAll('.dot');
    if (!stack || items.length === 0) return;

    let currentIndex = 0;
    const total = items.length;
    
    // Config mirroring the React component
    const spreadDeg = 48;
    const depthPx = 140;
    const activeLiftPx = 22;
    const maxVisibleOffset = 3;

    function updateStack() {
        items.forEach((item, i) => {
            // Find minimal signed offset with wrapping
            let off = i - currentIndex;
            
            // Loop adjustment
            if (off > total / 2) off -= total;
            if (off < -total / 2) off += total;

            const absOff = Math.abs(off);
            const visible = absOff <= maxVisibleOffset;

            if (!visible) {
                item.style.opacity = '0';
                item.style.pointerEvents = 'none';
                return;
            }

            // Geometry calculations
            const rotateZ = off * (spreadDeg / maxVisibleOffset);
            const x = off * (window.innerWidth < 768 ? 40 : 60); // dynamic spacing
            const z = -absOff * depthPx;
            const scale = off === 0 ? 1 : 0.92;
            const y = off === 0 ? 0 : absOff * 15;
            const rotateX = off === 0 ? 0 : 8;

            item.style.opacity = visible ? (1 - absOff * 0.2) : '0';
            item.style.zIndex = 100 - absOff;
            item.style.transform = `translateX(calc(-50% + ${x}px)) translateY(${y}px) translateZ(${z}px) rotateZ(${rotateZ}deg) rotateX(${rotateX}deg) scale(${scale})`;
            item.style.left = '50%'; // Force centering
            item.style.pointerEvents = off === 0 ? 'auto' : 'none';

            item.classList.toggle('active', off === 0);
        });

        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
        });
    }

    function next() {
        currentIndex = (currentIndex + 1) % total;
        updateStack();
    }

    function prev() {
        currentIndex = (currentIndex - 1 + total) % total;
        updateStack();
    }

    // Interaction Listeners
    stack.addEventListener('click', (e) => {
        const item = e.target.closest('.card-stack-item');
        if (item) {
            const index = parseInt(item.getAttribute('data-index'));
            if (index === currentIndex) {
                // If clicking active card, go next
                next();
            } else {
                currentIndex = index;
                updateStack();
            }
        }
    });

    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
            currentIndex = i;
            updateStack();
        });
    });

    // Simple Swipe Support
    let startX = 0;
    stack.addEventListener('touchstart', e => startX = e.touches[0].clientX);
    stack.addEventListener('touchend', e => {
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) next();
            else prev();
        }
    });

    // Auto Advance
    let autoInterval = setInterval(next, 3500);
    stack.addEventListener('mouseenter', () => clearInterval(autoInterval));
    stack.addEventListener('mouseleave', () => autoInterval = setInterval(next, 3500));

    updateStack();
}

// Advanced Reviews Logic
function toggleReviewModal() {
    const modal = document.getElementById('review-modal');
    modal.classList.toggle('active');
}

// Form Submission & Local Storage simulation
const reviewForm = document.getElementById('review-form');
if (reviewForm) {
    reviewForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const name = document.getElementById('rev-name').value;
        const text = document.getElementById('rev-text').value;
        const rating = document.querySelector('input[name="rating"]:checked')?.value || 5;
        const imageFile = document.getElementById('rev-image').files[0];
        
        // Generate pseudo-avatar letter
        const firstLetter = name.charAt(0).toUpperCase();
        
        // Show "sending" state
        const submitBtn = reviewForm.querySelector('.btn-submit-review');
        const originalText = submitBtn.innerText;
        submitBtn.innerText = 'Enviando...';
        submitBtn.disabled = true;

        // Process image if exists
        const processReview = (imgSrc) => {
            const reviewsList = document.getElementById('reviews-list');
            const newReview = document.createElement('div');
            newReview.className = 'review-card';
            newReview.style.animation = 'fadeInUp 0.6s ease forwards';
            
            let starsHtml = '';
            for(let i=0; i<5; i++) starsHtml += (i < rating ? '★' : '☆');

            newReview.innerHTML = `
                <div class="rc-image">
                    <img src="${imgSrc || 'https://images.unsplash.com/photo-1598257006458-087169a1f08d?w=500&h=500&fit=crop'}" alt="Review Image">
                    <div class="rc-user-tag"><span class="avatar-letter">${firstLetter}</span> ${name}</div>
                </div>
                <div class="rc-content">
                    <div class="stars" style="color:#ffb400">${starsHtml} <i class="fas fa-check-circle verified-check" style="color:#27ae60"></i></div>
                    <p>"${text}"</p>
                    <div class="rc-footer">
                        <div class="vote"><i class="far fa-thumbs-up"></i> 0</div>
                        <div class="vote"><i class="far fa-thumbs-down"></i> 0</div>
                    </div>
                </div>
            `;
            
            reviewsList.prepend(newReview);
            
            // Clean and close
            setTimeout(() => {
                submitBtn.innerText = 'Enviado com Sucesso!';
                setTimeout(() => {
                    toggleReviewModal();
                    reviewForm.reset();
                    submitBtn.innerText = originalText;
                    submitBtn.disabled = false;
                }, 1000);
            }, 8000);
        };

        if (imageFile) {
            const reader = new FileReader();
            reader.onload = (e) => processReview(e.target.result);
            reader.readAsDataURL(imageFile);
        } else {
            processReview(null);
        }
    });
}
