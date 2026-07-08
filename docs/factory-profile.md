# MES Lite Factory Profile

MES Lite demo data is modeled as a medium-sized metal door-hardware factory. The scenario is intentionally concrete so the web dashboard, mobile operator app, quality workflow, inventory, routing, and shift planning screens tell one consistent story.

## Factory Type

- Sector: metal door handles, hinge sets, lock plates, and door-handle rosettes
- Production model: planned and order-based work orders
- Main flow: cutting, CNC machining, drilling, deburring, surface treatment, assembly, function testing, final quality, and packaging

This profile creates realistic MES problems: operator authorization, machine skills, route handoff, scrap quarantine, rework/reproduction decisions, stock consumption, quality traceability, and offline mobile production entry.

## Product Families

- Aluminum Door Handle
- Stainless Door Handle
- Lock Strike Plate
- Hinge Set
- Door Handle Rosette

These products have different routes and material needs, which makes the demo more believable than a single generic product.

## Standard Routes

Aluminum Door Handle:

```text
Profile Cutting -> CNC Machining -> Drilling and Countersink -> Deburring
-> Electrostatic Painting -> Mechanism Assembly -> Function Test
-> Final Quality -> Packaging
```

Stainless Door Handle:

```text
Sheet Cutting -> CNC Machining -> Drilling and Countersink -> Polishing
-> Mechanism Assembly -> Function Test -> Final Quality -> Packaging
```

Lock Strike Plate:

```text
Laser Cutting -> Press Brake Bending -> Deburring -> Dimensional Control -> Packaging
```

Hinge Set:

```text
Sheet Cutting -> Pressing -> Drilling -> Pin and Screw Assembly
-> Function Test -> Final Quality -> Packaging
```

Door Handle Rosette:

```text
Pressing -> Drilling -> Deburring -> Electrostatic Painting
-> Dimensional Control -> Packaging
```

## Machine Groups

- Laser cutting
- Pressing and bending
- CNC machining
- Drilling and countersink
- Deburring and polishing
- Electrostatic painting
- Assembly
- Function testing
- Quality control
- Packaging

Operators are grouped by capability. Shift planning and machine-skill records make sure a cutting operator, CNC operator, surface-treatment operator, assembly operator, and quality operator each work in the right part of the process.

## BOM and Inventory

Finished products use components such as:

- Aluminum profile 6061
- Stainless steel sheet 304
- Zamak casting body
- M5 screw set
- Spring mechanism
- Black electrostatic powder paint
- Product label
- Door-hardware carton

Inventory is split into raw material, assembly component, paint, packaging, and finished-goods locations. The demo seed creates starting stock and stock movements so inventory screens are meaningful immediately.

## Shift Automation

The demo seed creates:

- 3 shift types: morning, evening, night
- 5 operator groups
- 5 monthly shift templates
- 2 months of generated roster assignments
- machine-skill records for each operator group

The web Shift Planning screen can then generate additional monthly plans from these templates. This keeps the roster from being hand-entered one cell at a time.

## Demo Seed

Run the door-hardware demo seed locally:

```powershell
cd backend
npm.cmd run seed:door
```

The seed resets demo operational data and creates a clean factory profile with products, routes, machines, stock, operators, shift groups, shift templates, roster assignments, and work orders.
