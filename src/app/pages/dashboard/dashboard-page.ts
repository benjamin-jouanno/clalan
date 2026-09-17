import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authentication.service';
import { GameDataModal } from '../../components/game-data-modal/game-data-modal';

@Component({
  selector: 'app-dashboard-page',
  imports: [CommonModule, FormsModule, GameDataModal],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
})
export class DashboardPage implements OnInit, OnDestroy {
  protected readonly authenticationService = inject(AuthenticationService);
  private readonly router = inject(Router);
  protected readonly countdown = signal({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  protected readonly showGameDataModal = signal(false);
  protected readonly raceImages: Record<string, string> = {
    human: 'human.png',
    dwarf: 'nain.png',
    'night-elf': 'elfe.png',
    gnome: 'gnome.png',
    orc: 'orc.png',
    undead: 'mortVivant.png',
    tauren: 'tauren.png',
    goblin: 'gobelin.png',
  };
  protected readonly classImages: Record<string, string> = {
    warrior: 'guerrier.png',
    paladin: 'paladin.png',
    hunter: 'chasseur.png',
    rogue: 'voleur.png',
    priest: 'pretre.png',
    shaman: 'chaman.png',
    mage: 'mage.png',
    warlock: 'demoniste.png',
    druid: 'druide.png',
  };
  protected newPostContent = '';
  protected commentDrafts: Record<number, string> = {};
  protected expandedComments: Record<number, boolean> = {};
  protected deletePostId: number | null = null;
  protected postBusy = false;
  protected readonly getRaceImage = (race: string | null): string =>
    this.raceImages[race ?? ''] ?? 'human.png';
  private countdownTimer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    void this.loadAccount();
    void this.authenticationService.getGuildMembers();
    void this.authenticationService.getPosts();
    this.updateCountdown();
    this.countdownTimer = setInterval(() => this.updateCountdown(), 1000);
  }

  protected async createPost(): Promise<void> {
    const content = this.newPostContent.trim();
    if (!content || this.postBusy) {
      return;
    }
    this.postBusy = true;
    try {
      await this.authenticationService.createPost(content);
      this.newPostContent = '';
    } finally {
      this.postBusy = false;
    }
  }

  protected async addComment(postId: number): Promise<void> {
    const content = (this.commentDrafts[postId] ?? '').trim();
    if (!content || this.postBusy) {
      return;
    }
    this.postBusy = true;
    try {
      await this.authenticationService.addComment(postId, content);
      this.commentDrafts[postId] = '';
    } finally {
      this.postBusy = false;
    }
  }

  protected async toggleUpvote(postId: number): Promise<void> {
    if (this.postBusy) {
      return;
    }
    this.postBusy = true;
    try {
      await this.authenticationService.togglePostUpvote(postId);
    } finally {
      this.postBusy = false;
    }
  }

  protected async deletePost(postId: number): Promise<void> {
    if (this.postBusy) {
      return;
    }
    this.deletePostId = postId;
  }

  protected cancelDeletePost(): void {
    this.deletePostId = null;
  }

  protected async confirmDeletePost(): Promise<void> {
    if (this.postBusy || this.deletePostId === null) {
      return;
    }
    this.postBusy = true;
    try {
      await this.authenticationService.deletePost(this.deletePostId);
      this.deletePostId = null;
    } finally {
      this.postBusy = false;
    }
  }

  protected toggleComments(postId: number): void {
    this.expandedComments[postId] = !this.expandedComments[postId];
  }

  protected visibleComments<T>(comments: T[], postId: number): T[] {
    const orderedComments = [...comments].reverse();
    return this.expandedComments[postId] ? orderedComments : orderedComments.slice(0, 3);
  }

  protected closeGameDataModal(): void {
    this.showGameDataModal.set(false);
  }

  protected editGameData(): void {
    this.showGameDataModal.set(true);
  }

  private async loadAccount(): Promise<void> {
    const account = await this.authenticationService.getAccount();
    if (!account.gameData.faction || !account.gameData.characterName || !account.gameData.race || !account.gameData.className || !account.gameData.role) {
      this.showGameDataModal.set(true);
    }
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }

  private updateCountdown(): void {
    const eventStart = new Date('2026-11-06T18:00:00');
    const remaining = Math.max(0, eventStart.getTime() - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);

    this.countdown.set({
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    });
  }

  protected logout(): void {
    this.authenticationService.logout();
    void this.router.navigate(['/auth']);
  }
}
