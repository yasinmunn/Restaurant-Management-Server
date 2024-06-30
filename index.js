const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 7001;

// Middleware
app.use(cors());
app.use(express.json());

//End

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bqxtqvh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server (optional starting in v4.7)
        await client.connect();
        const userCollection = client.db("bistroDb").collection("users");
        const menuCollection = client.db("bistroDb").collection("menu");
        const reviewCollection = client.db("bistroDb").collection("reviews");
        const cartCollection = client.db("bistroDb").collection("carts");
        const paymentCollection = client.db("bistroDb").collection("payments");

        //jwt related api 

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token });

        })

        //End


        //Middleware

        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'forbidden access' })
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
                if (error) {
                    return res.status(401).send({ message: 'forbidden access' })
                }
                req.decoded = decoded;
                next()
            })

        }

        //End

        //Verify Admin with Token 

        const verifyAdmin = async (req, res, next) => {
            const user = await userCollection.findOne({ email: req.decoded.email })
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            next()
        }

        //End 

        // User Related API

        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await userCollection.findOne({ email: user.email })
            if (existingUser) {
                return res.send({ message: 'User Already Exist', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });


        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })


        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const result = await userCollection.deleteOne({ _id: new ObjectId(id) })
            res.send(result);
        })


        //Admin Verification

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Unauthorized Access' })
            }
            const user = await userCollection.findOne({ email: email })
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';

            }
            res.send({ admin })
        })

        //End

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            };

            const result = await userCollection.updateOne({ _id: new ObjectId(req.params.id) }, updatedDoc);

            // Assuming `result` always contains `modifiedCount` due to your requirements
            res.send(result);
        });




        //End

        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result);
        });

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await menuCollection.insertOne(item);
            res.send(result);
        });

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.findOne(query)
            res.send(result)
        })

        // Menu Item Delete 

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        })


        // Update Item
        app.patch('/menu/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    recipe: item.recipe,
                    image: item.image,
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc)
            res.send(result)
        });

        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        });

        //Payment History

        app.get('/payments', verifyToken, async (req, res) => {
            const email = req.query.email;

            if (!email || email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const query = { email: email };
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        });

        //End


        // Stripe 


        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);


            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment)
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };
            const deleteResult = await cartCollection.deleteMany(query)
            res.send({ paymentResult, deleteResult })
        })


        //End 


        // Carts Collection 
        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        });

        // Cart Item Collection
        app.get('/carts', async (req, res) => {
            const email = req.query.email
            const result = await cartCollection.find({ email: email }).toArray()
            res.send(result)
        })

        // Delete Cart Item

        app.delete('/cart/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const result = await cartCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result)

        })

        //Stats or Analytics 
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const user = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount()
            const orders = await paymentCollection.estimatedDocumentCount()

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray()

            const revenue = result.length > 0 ? result[0].totalRevenue : 0

            res.send({
                user,
                menuItems,
                orders,
                revenue
            })
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } catch (error) {
        console.error(error);
    } finally {
        // Ensures that the client will close when you finish/error
        // Comment this out if you want to keep the connection alive for the server
        // await client.close();
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Boss Is Sitting');
});

app.listen(port, () => {
    console.log(`Bistro Boss Is Sitting on Port ${port}`);
});
