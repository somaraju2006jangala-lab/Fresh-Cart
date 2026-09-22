import { Coupon } from '../types';

export const INITIAL_COUPONS: Coupon[] = [
  {
    id: 'coupon-1',
    code: 'SAVE5',
    discountPercentage: 5,
    isActive: true,
    description: '5% OFF on your entire fresh grocery cart',
    createdAt: '2026-09-20',
  },
  {
    id: 'coupon-2',
    code: 'SAVE10',
    discountPercentage: 10,
    isActive: true,
    description: '10% OFF on all organic produce and daily essentials',
    createdAt: '2026-09-20',
  },
  {
    id: 'coupon-3',
    code: 'SAVE20',
    discountPercentage: 20,
    isActive: true,
    description: '20% OFF super savings for seasonal harvests',
    createdAt: '2026-09-20',
  },
  {
    id: 'coupon-4',
    code: 'FRESH15',
    discountPercentage: 15,
    isActive: true,
    description: '15% OFF for farm-fresh dairy and bakery items',
    createdAt: '2026-09-21',
  },
  {
    id: 'coupon-5',
    code: 'FESTIVE3',
    discountPercentage: 3,
    isActive: true,
    description: '3% quick checkout discount',
    createdAt: '2026-09-22',
  },
];
