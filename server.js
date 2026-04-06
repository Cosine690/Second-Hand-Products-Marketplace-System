const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
const MONGO_URI = 'mongodb://127.0.0.1:27017/tradehub';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Local Database!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- DATABASE SCHEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },     
    address: { type: String, required: true }, 
    role: { type: String, default: "user" }, // NEW: Role-Based Access Control
    favorites: [{ type: String }]
}));

const Product = mongoose.model('Product', new mongoose.Schema({
    title: { type: String, required: true },
    price: { type: String, required: true },
    category: { type: String, required: true },
    location: { type: String, required: true },
    image: { type: String },
    description: { type: String, required: true },
    date: { type: String, default: "JUST NOW" },
    sellerId: { type: String, required: true },
    sellerName: { type: String },  
    sellerUpi: { type: String, required: true }, 
    status: { type: String, default: "Available" }, 
    buyerId: { type: String, default: null },
    
    orderId: { type: String, default: null },
    buyerName: { type: String, default: null },
    buyerPhone: { type: String, default: null },
    buyerAddress: { type: String, default: null }, 
    checkoutDateStr: { type: String, default: null },
    estimatedDeliveryStr: { type: String, default: null },
    deliveryStatus: { type: String, default: "Pending" },
    paymentDetails: { type: Object, default: {} }
}));

// --- API ROUTES ---

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone, address } = req.body;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json({ message: 'Invalid email format.' });

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) return res.status(400).json({ message: 'Password does not meet security requirements.' });
        
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'Email already registered.' });

        // NEW: Automatically make this specific email the Master Admin
        const role = email === 'admin@tradehub.com' ? 'admin' : 'user';

        const newUser = new User({ name, email, password, phone, address, role });
        await newUser.save();
        res.status(201).json({ message: 'Registration successful!' });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, password });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });
        
        // Send the role back to the frontend
        res.json({ message: 'Login successful', user: { id: user._id, name: user.name, email: user.email, phone: user.phone, address: user.address, role: user.role, favorites: user.favorites } });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ _id: -1 }); 
        res.json(products);
    } catch (error) { res.status(500).json({ message: 'Failed to fetch products' }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        res.status(201).json({ message: 'Product added successfully!' });
    } catch (error) { res.status(500).json({ message: 'Failed to add product' }); }
});

// Admin / Owner Delete Route
app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Product deleted' });
    } catch (error) { res.status(500).json({ message: 'Failed to delete product' }); }
});

app.post('/api/users/:id/favorites', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        const { productId } = req.body;
        if (user.favorites.includes(productId)) { user.favorites = user.favorites.filter(id => id !== productId); } 
        else { user.favorites.push(productId); }
        await user.save();
        res.json({ favorites: user.favorites }); 
    } catch (error) { res.status(500).json({ message: 'Failed to update favorites' }); }
});

app.post('/api/products/:id/checkout', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product || product.status === "Sold") return res.status(400).json({ message: 'Item is no longer available.' });

        const buyer = await User.findById(req.body.buyerId);

        const now = new Date();
        const estDate = new Date();
        estDate.setDate(now.getDate() + 3); 

        const formatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
        
        const basePrice = parseInt(product.price.replace(/[^0-9]/g, ''));
        const packaging = 6;
        const gst = parseFloat((basePrice * 0.05).toFixed(2)); 
        const discount = parseFloat((basePrice * 0.10).toFixed(2)); 
        const total = Math.round(basePrice + packaging + gst - discount);

        product.status = "Sold";
        product.buyerId = buyer._id;
        product.buyerName = buyer.name;
        product.buyerPhone = buyer.phone;
        product.buyerAddress = buyer.address; 
        
        product.orderId = Math.floor(Math.random() * 1000000000).toString();
        product.checkoutDateStr = now.toLocaleString('en-US', formatOptions);
        product.estimatedDeliveryStr = estDate.toLocaleString('en-US', formatOptions);
        product.deliveryStatus = "Order Placed";
        
        product.paymentDetails = { mrp: basePrice, packaging: packaging, gst: gst, discount: discount, total: total };

        await product.save();
        res.json({ message: 'UPI Payment verified! Order placed for delivery.' });
    } catch (error) { res.status(500).json({ message: 'Checkout failed on server.' }); }
});

app.post('/api/products/:id/delivery', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product) {
            product.deliveryStatus = req.body.status;
            await product.save();

            if (req.body.status === "Delivered") {
                console.log(`📦 Item Delivered! Starting 1 minute countdown to delete product ${product._id}...`);
                setTimeout(async () => {
                    try {
                        await Product.findByIdAndDelete(product._id);
                        console.log(`🗑️ Auto-deleted delivered product ${product._id}.`);
                    } catch (err) {
                        console.error("Failed to auto-delete:", err);
                    }
                }, 60000); 
            }

            res.json({ message: 'Delivery status updated!' });
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) { res.status(500).json({ message: 'Update failed on server.' }); }
});

app.listen(PORT, () => console.log(`🚀 Real Backend running on http://localhost:${PORT}`));