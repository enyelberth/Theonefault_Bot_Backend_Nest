import statistics

print("Calculando estadísticas del dataset")

data = [ 
    {"symbol":"LINKFDUSD","price":22.82,"volume":0.33},
    {"symbol":"LINKFDUSD","price":22.85,"volume":2},
    {"symbol":"LINKFDUSD","price":22.84,"volume":2.7},
    {"symbol":"LINKFDUSD","price":22.83,"volume":2.63},
    {"symbol":"LINKFDUSD","price":22.88,"volume":23.3},
    {"symbol":"LINKFDUSD","price":22.88,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.85,"volume":2},
    {"symbol":"LINKFDUSD","price":22.85,"volume":3.58},
    {"symbol":"LINKFDUSD","price":22.85,"volume":2.76},
    {"symbol":"LINKFDUSD","price":22.82,"volume":2},
    {"symbol":"LINKFDUSD","price":22.79,"volume":0.33},
    {"symbol":"LINKFDUSD","price":22.79,"volume":3.86},
    {"symbol":"LINKFDUSD","price":22.78,"volume":3.06},
    {"symbol":"LINKFDUSD","price":22.77,"volume":0.33},
    {"symbol":"LINKFDUSD","price":22.79,"volume":0.33},
    {"symbol":"LINKFDUSD","price":22.79,"volume":2.77},
    {"symbol":"LINKFDUSD","price":22.81,"volume":2.91},
    {"symbol":"LINKFDUSD","price":22.78,"volume":2},
    {"symbol":"LINKFDUSD","price":22.77,"volume":2},
    {"symbol":"LINKFDUSD","price":22.77,"volume":2.95},
    {"symbol":"LINKFDUSD","price":22.77,"volume":2.65},
    {"symbol":"LINKFDUSD","price":22.77,"volume":2.73},
    {"symbol":"LINKFDUSD","price":22.77,"volume":2.94},
    {"symbol":"LINKFDUSD","price":22.74,"volume":3.79},
    {"symbol":"LINKFDUSD","price":22.74,"volume":2},
    {"symbol":"LINKFDUSD","price":22.77,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.76,"volume":0.77},
    {"symbol":"LINKFDUSD","price":22.77,"volume":0.33},
    {"symbol":"LINKFDUSD","price":22.75,"volume":3.07},
    {"symbol":"LINKFDUSD","price":22.74,"volume":0.72},
    {"symbol":"LINKFDUSD","price":22.74,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.75,"volume":2.77},
    {"symbol":"LINKFDUSD","price":22.66,"volume":3.49},
    {"symbol":"LINKFDUSD","price":22.66,"volume":2},
    {"symbol":"LINKFDUSD","price":22.64,"volume":2},
    {"symbol":"LINKFDUSD","price":22.65,"volume":0.34},
    {"symbol":"LINKFDUSD","price":22.66,"volume":2},
    {"symbol":"LINKFDUSD","price":22.67,"volume":6.06},
    {"symbol":"LINKFDUSD","price":22.67,"volume":3.14},
    {"symbol":"LINKFDUSD","price":22.68,"volume":1.47},
    {"symbol":"LINKFDUSD","price":22.68,"volume":2.28},
    {"symbol":"LINKFDUSD","price":22.7,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.7,"volume":3.07},
    {"symbol":"LINKFDUSD","price":22.7,"volume":3.34},
    {"symbol":"LINKFDUSD","price":22.7,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.69,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.7,"volume":0.48},
    {"symbol":"LINKFDUSD","price":22.69,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.7,"volume":23.4},
    {"symbol":"LINKFDUSD","price":22.69,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.7,"volume":0.34},
    {"symbol":"LINKFDUSD","price":22.72,"volume":2},
    {"symbol":"LINKFDUSD","price":22.71,"volume":3.38},
    {"symbol":"LINKFDUSD","price":22.71,"volume":2.98},
    {"symbol":"LINKFDUSD","price":22.74,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.73,"volume":3.65},
    {"symbol":"LINKFDUSD","price":22.71,"volume":2},
    {"symbol":"LINKFDUSD","price":22.71,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.69,"volume":2},
    {"symbol":"LINKFDUSD","price":22.68,"volume":2},
    {"symbol":"LINKFDUSD","price":22.64,"volume":2},
    {"symbol":"LINKFDUSD","price":22.63,"volume":2.27},
    {"symbol":"LINKFDUSD","price":22.63,"volume":2},
    {"symbol":"LINKFDUSD","price":22.62,"volume":5.14},
    {"symbol":"LINKFDUSD","price":22.61,"volume":3.61},
    {"symbol":"LINKFDUSD","price":22.62,"volume":5.14},
]

prices = [item["price"] for item in data]
volumes = [item["volume"] for item in data]

print(f"Promedio Price: {statistics.mean(prices):.4f}")
print(f"Promedio Volume: {statistics.mean(volumes):.4f}")

print(f"Mediana Price: {statistics.median(prices):.4f}")
print(f"Mediana Volume: {statistics.median(volumes):.4f}")

# Moda puede lanzar excepción si no hay moda única, manejo de excepción
try:
    print(f"Moda Price: {statistics.mode(prices):.4f}")
except statistics.StatisticsError:
    print("Moda Price: No hay un valor único que se repita más veces")

try:
    print(f"Moda Volume: {statistics.mode(volumes):.4f}")
except statistics.StatisticsError:
    print("Moda Volume: No hay un valor único que se repita más veces")

print(f"Varianza Price: {statistics.variance(prices):.6f}")
print(f"Varianza Volume: {statistics.variance(volumes):.6f}")

print(f"Desviación estándar Price: {statistics.stdev(prices):.6f}")
print(f"Desviación estándar Volume: {statistics.stdev(volumes):.6f}")

print(f"Máximo Price: {max(prices):.4f}")
print(f"Máximo Volume: {max(volumes):.4f}")

print(f"Mínimo Price: {min(prices):.4f}")
print(f"Mínimo Volume: {min(volumes):.4f}")

print(f"Suma Total Price: {sum(prices):.4f}")
print(f"Suma Total Volume: {sum(volumes):.4f}")
