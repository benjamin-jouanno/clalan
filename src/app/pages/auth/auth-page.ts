import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authentication.service';

@Component({
  selector: 'app-auth-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.css',
})
export class AuthPage {
  private readonly authenticationService = inject(AuthenticationService);
  private readonly router = inject(Router);
  protected isRegistering = false;
  protected loginIdentifier = '';
  protected loginPassword = '';
  protected rememberMe = true;
  protected username = '';
  protected email = '';
  protected password = '';
  protected confirmPassword = '';
  protected isSubmitting = false;
  protected errorMessage = '';
  protected successMessage = '';

  constructor() {
    if (this.authenticationService.hasToken()) {
      void this.router.navigate(['/dashboard']);
    }
  }

  protected switchMode(): void {
    this.isRegistering = !this.isRegistering;
    this.errorMessage = '';
    this.successMessage = '';
  }

  protected async submitLogin(): Promise<void> {
    await this.submit(async () => {
      await this.authenticationService.login(
        this.loginIdentifier,
        this.loginPassword,
        this.rememberMe,
      );
      await this.router.navigate(['/dashboard']);
    });
  }

  protected async submitRegistration(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Les mots de passe ne correspondent pas.';
      return;
    }

    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(this.username)) {
      this.errorMessage =
        "Le nom d'utilisateur doit contenir uniquement des caractères ASCII, chiffres, _ ou - (3 à 24 caractères).";
      return;
    }

    await this.submit(async () => {
      await this.authenticationService.register(this.username, this.email, this.password);
      await this.router.navigate(['/dashboard']);
    });
  }

  private async submit(action: () => Promise<void>): Promise<void> {
    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await action();
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Impossible de terminer la demande.';
    } finally {
      this.isSubmitting = false;
    }
  }
}
