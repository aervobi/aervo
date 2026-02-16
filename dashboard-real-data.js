// dashboard-data.js - Add this script to your dashboard.html before the closing </body> tag

// ============= REAL SHOPIFY DATA FETCHING =============

const BACKEND_URL = 'https://aervo-backend.onrender.com';
const token = localStorage.getItem('aervo_token');

let realShopifyData = {
  overview: null,
  orders: null,
  inventory: null,
  customers: null,
  analytics: null
};

// Fetch all Shopify data
async function fetchShopifyData(shop) {
  if (!shop) return;

  try {
    const headers = { 'Authorization': `Bearer ${token}` };
    
    // Fetch all data in parallel
    const [overview, orders, inventory, customers, analytics] = await Promise.all([
      fetch(`${BACKEND_URL}/api/shopify/overview?shop=${shop}`, { headers }).then(r => r.json()),
      fetch(`${BACKEND_URL}/api/shopify/orders?shop=${shop}&limit=50`, { headers }).then(r => r.json()),
      fetch(`${BACKEND_URL}/api/shopify/inventory?shop=${shop}`, { headers }).then(r => r.json()),
      fetch(`${BACKEND_URL}/api/shopify/customers?shop=${shop}`, { headers }).then(r => r.json()),
      fetch(`${BACKEND_URL}/api/shopify/analytics?shop=${shop}&days=7`, { headers }).then(r => r.json())
    ]);

    realShopifyData = {
      overview: overview.success ? overview.data : null,
      orders: orders.success ? orders.orders : null,
      inventory: inventory.success ? inventory.inventory : null,
      customers: customers.success ? customers.customers : null,
      analytics: analytics.success ? analytics.analytics : null
    };

    console.log('✅ Shopify data loaded:', realShopifyData);
    
    return realShopifyData;
  } catch (err) {
    console.error('Failed to fetch Shopify data:', err);
    return null;
  }
}

// UPDATED RENDER FUNCTIONS WITH REAL DATA

function renderOverviewWithRealData() {
  if (!shopData) {
    return renderConnectShopify();
  }

  const data = realShopifyData.overview;
  const orders = realShopifyData.orders || [];
  const inventory = realShopifyData.inventory;

  // Use real data if available, fallback to loading state
  const revenue = data ? `$${parseFloat(data.revenue.total).toLocaleString()}` : '...';
  const revenueChange = data ? data.revenue.change : '...';
  const ordersToday = data ? data.orders.today : '...';
  const ordersChange = data ? data.orders.change : '...';
  const conversionRate = data ? `${data.conversion.rate}%` : '...';
  const outOfStock = inventory ? inventory.outOfStock.length : '...';
  const lowStock = inventory ? inventory.lowStock.length : '...';

  // Generate AI insights based on real data
  const insights = generateAIInsights(data, inventory);

  return `
    <div class="welcome">
      <h1>Welcome back, ${userData.companyName}</h1>
      <p>Here's what's happening with your store today</p>
    </div>

    <!-- AI Insights with REAL DATA -->
    <div class="ai-banner">
      <div class="ai-banner-header">
        <div class="ai-icon">🤖</div>
        <h2>AI Insights & Recommendations</h2>
      </div>
      ${insights.map(insight => `
        <div class="insight-item">
          <span class="insight-priority priority-${insight.priority}">${insight.priorityLabel}</span>
          <strong>${insight.title}</strong> — ${insight.description}
        </div>
      `).join('')}
    </div>

    <!-- Key Metrics with REAL DATA -->
    <div class="grid-4">
      <div class="card">
        <h3>Revenue (30 days)</h3>
        <div class="stat-large">${revenue}</div>
        <div class="stat-change ${parseFloat(revenueChange) >= 0 ? 'positive' : 'negative'}">
          <span>${parseFloat(revenueChange) >= 0 ? '↑' : '↓'}</span>
          <span>${Math.abs(revenueChange)}% vs last month</span>
        </div>
      </div>

      <div class="card">
        <h3>Orders Today</h3>
        <div class="stat-large">${ordersToday}</div>
        <div class="stat-change ${parseFloat(ordersChange) >= 0 ? 'positive' : 'negative'}">
          <span>${parseFloat(ordersChange) >= 0 ? '↑' : '↓'}</span>
          <span>${Math.abs(ordersChange)}% vs yesterday</span>
        </div>
      </div>

      <div class="card">
        <h3>Conversion Rate</h3>
        <div class="stat-large">${conversionRate}</div>
        <div class="stat-label">Industry avg: 2.5%</div>
      </div>

      <div class="card">
        <h3>Inventory Alerts</h3>
        <div class="stat-large" style="color: #ef4444;">${outOfStock}</div>
        <div class="stat-change negative">
          <span>⚠</span>
          <span>Out of stock</span>
        </div>
        <div class="stat-label">${lowStock} low stock items</div>
      </div>
    </div>

    <!-- Recent Orders with REAL DATA -->
    <div class="card" style="margin-top: 24px;">
      <h3>Recent Orders</h3>
      ${renderRecentOrders(orders)}
    </div>

    <!-- Action Center -->
    <div class="grid-2" style="margin-top: 24px;">
      <div class="card">
        <h3>Action Center</h3>
        ${renderActionCenter(inventory, orders)}
      </div>

      <div class="card">
        <h3>Ask Aervo Anything</h3>
        <div class="chat-container">
          <div class="chat-messages" id="chatMessages">
            <div class="chat-message ai">
              👋 Hi! I'm your AI co-pilot. Ask me about your sales, inventory, customers, or anything else about your store.
            </div>
          </div>
          <div class="chat-input-wrapper">
            <input 
              type="text" 
              class="chat-input" 
              id="chatInput" 
              placeholder="e.g., What were my top products this week?"
            />
            <button class="btn-send" onclick="sendMessage()">Send</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAnalyticsWithRealData() {
  const data = realShopifyData.overview;
  const orders = realShopifyData.orders || [];

  // Calculate metrics
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return `
    <div class="welcome">
      <h1>Sales Analytics</h1>
      <p>Deep dive into your revenue, orders, and performance trends</p>
    </div>

    <div class="grid-4">
      <div class="card">
        <h3>Total Revenue (30d)</h3>
        <div class="stat-large">$${totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        <div class="stat-change positive">↑ ${data ? data.revenue.change : 0}% vs last month</div>
      </div>
      <div class="card">
        <h3>Average Order Value</h3>
        <div class="stat-large">$${avgOrderValue.toFixed(2)}</div>
      </div>
      <div class="card">
        <h3>Total Orders</h3>
        <div class="stat-large">${totalOrders}</div>
      </div>
      <div class="card">
        <h3>Orders Today</h3>
        <div class="stat-large">${data ? data.orders.today : 0}</div>
      </div>
    </div>

    <div class="card" style="margin-top: 24px;">
      <h3>Recent Orders</h3>
      ${renderRecentOrders(orders.slice(0, 20))}
    </div>
  `;
}

function renderInventoryWithRealData() {
  const inventory = realShopifyData.inventory;

  if (!inventory) {
    return '<div class="loading"><div class="spinner"></div><div>Loading inventory...</div></div>';
  }

  const needsAttention = [...inventory.outOfStock, ...inventory.lowStock].slice(0, 20);

  return `
    <div class="welcome">
      <h1>Inventory Health</h1>
      <p>Monitor stock levels and get smart reorder recommendations</p>
    </div>

    <div class="grid-4">
      <div class="card">
        <h3>Total Products</h3>
        <div class="stat-large">${inventory.totalProducts}</div>
        <div class="stat-label">${inventory.totalVariants} variants</div>
      </div>
      <div class="card">
        <h3>Out of Stock</h3>
        <div class="stat-large" style="color: #ef4444;">${inventory.outOfStock.length}</div>
        <div class="stat-change negative">⚠ Needs attention</div>
      </div>
      <div class="card">
        <h3>Low Stock</h3>
        <div class="stat-large" style="color: #f59e0b;">${inventory.lowStock.length}</div>
        <div class="stat-label">Below 10 units</div>
      </div>
      <div class="card">
        <h3>In Stock</h3>
        <div class="stat-large">${inventory.items.filter(i => i.status === 'in_stock').length}</div>
        <div class="stat-label">Healthy inventory</div>
      </div>
    </div>

    <div class="card" style="margin-top: 24px;">
      <h3>Products Needing Attention</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Stock</th>
            <th>Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${needsAttention.map(item => `
            <tr>
              <td>${item.productTitle}${item.variantTitle !== 'Default Title' ? ` (${item.variantTitle})` : ''}</td>
              <td>${item.sku || 'N/A'}</td>
              <td style="color: ${item.status === 'out_of_stock' ? '#ef4444' : '#f59e0b'};">${item.quantity}</td>
              <td>$${parseFloat(item.price).toFixed(2)}</td>
              <td><span class="insight-priority priority-${item.status === 'out_of_stock' ? 'high' : 'medium'}">${item.status === 'out_of_stock' ? 'Out of Stock' : 'Low Stock'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCustomersWithRealData() {
  const customers = realShopifyData.customers;

  if (!customers) {
    return '<div class="loading"><div class="spinner"></div><div>Loading customers...</div></div>';
  }

  return `
    <div class="welcome">
      <h1>Customer Intelligence</h1>
      <p>Understand your customers and increase lifetime value</p>
    </div>

    <div class="grid-4">
      <div class="card">
        <h3>Total Customers</h3>
        <div class="stat-large">${customers.total}</div>
      </div>
      <div class="card">
        <h3>Repeat Customers</h3>
        <div class="stat-large">${customers.repeatRate}%</div>
        <div class="stat-label">${customers.repeatCustomers} customers</div>
      </div>
      <div class="card">
        <h3>Avg Lifetime Value</h3>
        <div class="stat-large">$${customers.avgLifetimeValue}</div>
      </div>
      <div class="card">
        <h3>Top Spenders</h3>
        <div class="stat-large">${customers.topCustomers.length}</div>
        <div class="stat-label">High-value customers</div>
      </div>
    </div>

    <div class="card" style="margin-top: 24px;">
      <h3>Top Customers</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Email</th>
            <th>Orders</th>
            <th>Total Spent</th>
          </tr>
        </thead>
        <tbody>
          ${customers.topCustomers.map(customer => `
            <tr>
              <td>${customer.name}</td>
              <td>${customer.email || 'N/A'}</td>
              <td>${customer.ordersCount}</td>
              <td>$${customer.totalSpent}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Helper render functions
function renderRecentOrders(orders) {
  if (!orders || orders.length === 0) {
    return '<p style="text-align: center; color: #64748b; padding: 20px;">No recent orders</p>';
  }

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Order #</th>
          <th>Customer</th>
          <th>Date</th>
          <th>Items</th>
          <th>Total</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${orders.slice(0, 10).map(order => `
          <tr>
            <td>${order.name || order.order_number}</td>
            <td>${order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : 'Guest'}</td>
            <td>${new Date(order.created_at).toLocaleDateString()}</td>
            <td>${order.line_items ? order.line_items.length : 0}</td>
            <td>$${parseFloat(order.total_price || 0).toFixed(2)}</td>
            <td><span class="stat-change positive" style="margin: 0;">${order.financial_status}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderActionCenter(inventory, orders) {
  const actions = [];

  if (inventory && inventory.outOfStock.length > 0) {
    actions.push({
      icon: '📦',
      title: `Restock ${inventory.outOfStock.length} out-of-stock items`,
      desc: 'Preventing potential lost revenue'
    });
  }

  if (inventory && inventory.lowStock.length > 0) {
    actions.push({
      icon: '💰',
      title: `Review ${inventory.lowStock.length} low-stock products`,
      desc: 'Set reorder points to avoid stockouts'
    });
  }

  if (actions.length === 0) {
    actions.push({
      icon: '✅',
      title: 'All caught up!',
      desc: 'No urgent actions needed'
    });
  }

  return `
    <ul class="action-list">
      ${actions.map(action => `
        <li class="action-item">
          <div class="action-icon">${action.icon}</div>
          <div class="action-content">
            <div class="action-title">${action.title}</div>
            <div class="action-desc">${action.desc}</div>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

function generateAIInsights(data, inventory) {
  const insights = [];

  // High priority: Out of stock
  if (inventory && inventory.outOfStock.length > 0) {
    const topItem = inventory.outOfStock[0];
    insights.push({
      priority: 'high',
      priorityLabel: 'HIGH PRIORITY',
      title: `${inventory.outOfStock.length} products are out of stock`,
      description: `Restock these items to avoid lost sales. Top priority: ${topItem.productTitle}`
    });
  }

  // Medium: Revenue trend
  if (data && parseFloat(data.revenue.change) > 10) {
    insights.push({
      priority: 'medium',
      priorityLabel: 'OPPORTUNITY',
      title: `Revenue is up ${data.revenue.change}% this month`,
      description: 'Great momentum! Consider expanding your marketing to capitalize on this growth.'
    });
  }

  // Low: Generic insight
  insights.push({
    priority: 'low',
    priorityLabel: 'INSIGHT',
    title: 'Monitor customer retention',
    description: 'Focus on repeat customers to increase lifetime value and sustainable growth.'
  });

  return insights;
}

// Export for use in dashboard
window.fetchShopifyData = fetchShopifyData;
window.renderOverviewWithRealData = renderOverviewWithRealData;
window.renderAnalyticsWithRealData = renderAnalyticsWithRealData;
window.renderInventoryWithRealData = renderInventoryWithRealData;
window.renderCustomersWithRealData = renderCustomersWithRealData;
window.realShopifyData = realShopifyData;