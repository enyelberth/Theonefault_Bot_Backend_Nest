export class Service {
    id: number;
    name: string;
    description: string;
    price: number;       // Cambiado de Float a number
    duration?: number;   // Campo opcional de duración
    createdAt: Date;
    updatedAt: Date;
}
