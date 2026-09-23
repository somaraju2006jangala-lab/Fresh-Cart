import { Coupon } from '../types';

export const INITIAL_COUPONS: Coupon[] = [
  {
    id: 'coupon-1',
    code: 'SAVE5',
    discountPercentage: 5,
    minOrderAmount: 1000,
    isActive: true,
    description: '5% OFF on orders ₹1,000+',
    createdAt: '2026-09-20',
  },
  {
    id: 'coupon-2',
    code: 'SAVE7',
    discountPercentage: 7,
    minOrderAmount: 1500,
    isActive: true,
    description: '7% OFF on orders ₹1,500+',
    createdAt: '2026-09-20',
  },
  {
    id: 'coupon-3',
    code: 'SAVE10',
    discountPercentage: 10,
    minOrderAmount: 2000,
    isActive: true,
    description: '10% OFF on orders ₹2,000+',
    createdAt: '2026-09-20',
  },
  {
    id: 'coupon-4',
    code: 'SAVE20',
    discountPercentage: 20,
    minOrderAmount: 3000,
    isActive: true,
    description: '20% OFF super savings on orders ₹3,000+',
    createdAt: '2026-09-21',
  },
];
