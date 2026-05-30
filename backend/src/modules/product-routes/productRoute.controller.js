import * as productRouteService from "./productRoute.service.js";

export async function list(_req, res) {
  const routes = await productRouteService.findProductRoutes();
  res.json({ data: routes });
}

export async function detail(req, res) {
  const route = await productRouteService.findProductRouteById(req.params.id);
  res.json({ data: route });
}

export async function create(req, res) {
  const route = await productRouteService.createProductRoute(req.validated.body);
  res.status(201).json({ data: route });
}

export async function update(req, res) {
  const route = await productRouteService.updateProductRoute(req.params.id, req.validated.body);
  res.json({ data: route });
}
