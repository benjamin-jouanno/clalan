import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthenticationService } from './services/authentication.service';

const requireToken = () => {
  const auth = inject(AuthenticationService);
  return auth.hasToken() || inject(Router).createUrlTree(['/auth']);
};
const redirectAuthenticated = () => {
  const auth = inject(AuthenticationService);
  return auth.hasToken() ? inject(Router).createUrlTree(['/dashboard']) : true;
};

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'auth',
  },
  {
    path: 'auth',
    canActivate: [redirectAuthenticated],
    loadComponent: () => import('./pages/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'dashboard',
    canActivate: [requireToken],
    loadComponent: () => import('./pages/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: '**',
    redirectTo: 'auth',
  },
];
