# TODO for Order Management Implementation

- [x] Create Order model (models/Order.js) with required fields: patientName, whatsappNumber, frameDetails, lensType, totalAmount, advance, balance, deliveryDate, rightEye (sph, cyl, axis), leftEye (sph, cyl, axis), addInput, importantNote, status (pending/completed), user ref.
- [ ] Create orderController.js with functions: createOrder, getPendingOrders, getCompletedOrders, updateOrder, deleteOrder, markAsComplete.
- [x] Create routes/order.js for API endpoints: POST /create, GET /pending, GET /completed, PUT /:id, DELETE /:id, PUT /:id/complete.
- [x] Update backend/index.js to register order routes.
- [x] Update OrderManagement.jsx to fetch from API, add create form, handle CRUD and status changes.
