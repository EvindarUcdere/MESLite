import * as productService from "./product.service.js";

export async function list(_req, res) {
  const products = await productService.findProducts();
  res.json({ data: products });
}

export async function create(req, res) {
  const product = await productService.createProduct(req.validated.body);
  res.status(201).json({ data: product });
}

export async function update(req, res) {
  const product = await productService.updateProduct(req.params.id, req.validated.body);
  res.json({ data: product });
}
