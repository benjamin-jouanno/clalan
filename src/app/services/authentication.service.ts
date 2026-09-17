import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LocalStorageService } from './local-storage.service';

export type AuthUser = {
  id: number;
  username: string;
  email: string;
};

export type GameData = {
  faction: 'alliance' | 'horde' | null;
  characterName: string | null;
  race: string | null;
  className: string | null;
  role: 'dps' | 'tank' | 'heal' | null;
};

export type Account = AuthUser & {
  createdAt: string;
  gameData: GameData;
};

export type GuildMember = {
  id: number;
  username: string;
  gameData: Pick<GameData, 'race' | 'className' | 'role' | 'faction'>;
};

export type SocialPost = {
  id: number;
  content: string;
  createdAt: string;
  author: GuildMember;
  upvotes: number;
  viewerUpvote: boolean;
  comments: Array<{
    id: number;
    content: string;
    createdAt: string;
    author: GuildMember;
  }>;
};

type AuthResponse = {
  user: AuthUser;
  token: string;
};

type ApiError = {
  error?: string;
};

@Injectable({ providedIn: 'root' })
export class AuthenticationService {
  private readonly apiUrl =
    typeof window === 'undefined'
      ? 'http://localhost:3000'
      : `${window.location.protocol}//${window.location.hostname}:3000`;
  private readonly tokenKey = 'clalan_token';
  private readonly http = inject(HttpClient);
  private readonly storage = inject(LocalStorageService);

  readonly currentUser = signal<AuthUser | null>(null);
  readonly account = signal<Account | null>(null);
  readonly guildMembers = signal<GuildMember[]>([]);
  readonly posts = signal<SocialPost[]>([]);

  async login(identifier: string, password: string, rememberMe: boolean): Promise<AuthUser> {
    const response = await this.request<AuthResponse>('/auth/login', {
      identifier,
      password,
    });
    this.storeToken(response.token, rememberMe);
    this.currentUser.set(response.user);
    this.account.set(null);
    return response.user;
  }

  async register(username: string, email: string, password: string): Promise<AuthUser> {
    const response = await this.request<AuthResponse>('/auth/register', {
      username,
      email,
      password,
    });
    this.storeToken(response.token, true);
    this.currentUser.set(response.user);
    this.account.set(null);
    return response.user;
  }

  async getAccount(): Promise<Account> {
    const response = await this.requestGet<{ account: Account }>('/api/account');
    this.account.set(response.account);
    this.currentUser.set(response.account);
    return response.account;
  }

  async updateGameData(gameData: GameData): Promise<GameData> {
    const response = await this.requestPatch<{ gameData: GameData }>('/api/account/game-data', gameData);
    const account = this.account();
    if (account) {
      this.account.set({ ...account, gameData: response.gameData });
      this.currentUser.set(account);
    }
    return response.gameData;
  }

  async getGuildMembers(): Promise<GuildMember[]> {
    const response = await this.requestGet<{ members: GuildMember[] }>('/api/guild-members');
    this.guildMembers.set(response.members);
    return response.members;
  }

  async getPosts(): Promise<SocialPost[]> {
    const response = await this.requestGet<{ posts: SocialPost[] }>('/api/posts');
    this.posts.set(response.posts);
    return response.posts;
  }

  async createPost(content: string): Promise<void> {
    await this.requestPost('/api/posts', { content });
    await this.getPosts();
  }

  async addComment(postId: number, content: string): Promise<void> {
    await this.requestPost(`/api/posts/${postId}/comments`, { content });
    await this.getPosts();
  }

  async togglePostUpvote(postId: number): Promise<void> {
    await this.requestPost(`/api/posts/${postId}/upvote`, {});
    await this.getPosts();
  }

  async deletePost(postId: number): Promise<void> {
    await this.requestDelete(`/api/posts/${postId}`);
    await this.getPosts();
  }

  logout(): void {
    this.storage.remove(this.tokenKey);
    sessionStorage.removeItem(this.tokenKey);
    this.currentUser.set(null);
    this.account.set(null);
    this.guildMembers.set([]);
    this.posts.set([]);
  }

  getToken(): string | null {
    return this.storage.get<string>(this.tokenKey) ?? sessionStorage.getItem(this.tokenKey);
  }

  hasToken(): boolean {
    return this.getToken() !== null;
  }

  private async request<T>(endpoint: string, body: object): Promise<T> {
    try {
      return await firstValueFrom(
        this.http.post<T>(`${this.apiUrl}${endpoint}`, body, {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    } catch (error) {
      throw this.toAuthError(error);
    }
  }

  private async requestPost(endpoint: string, body: object): Promise<void> {
    try {
      const token = this.getToken();
      await firstValueFrom(
        this.http.post<unknown>(`${this.apiUrl}${endpoint}`, body, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }),
      );
    } catch (error) {
      throw this.toAuthError(error);
    }
  }

  private async requestDelete(endpoint: string): Promise<void> {
    try {
      const token = this.getToken();
      await firstValueFrom(
        this.http.delete<unknown>(`${this.apiUrl}${endpoint}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
      );
    } catch (error) {
      throw this.toAuthError(error);
    }
  }

  private async requestGet<T>(endpoint: string): Promise<T> {
    try {
      const token = this.getToken();
      return await firstValueFrom(
        this.http.get<T>(`${this.apiUrl}${endpoint}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
      );
    } catch (error) {
      throw this.toAuthError(error);
    }
  }

  private async requestPatch<T>(endpoint: string, body: object): Promise<T> {
    try {
      const token = this.getToken();
      return await firstValueFrom(
        this.http.patch<T>(`${this.apiUrl}${endpoint}`, body, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }),
      );
    } catch (error) {
      throw this.toAuthError(error);
    }
  }

  private storeToken(token: string, rememberMe: boolean): void {
    const storage = rememberMe ? localStorage : sessionStorage;
    const otherStorage = rememberMe ? sessionStorage : localStorage;
    otherStorage.removeItem(this.tokenKey);
    if (rememberMe) {
      this.storage.set(this.tokenKey, token);
    } else {
      storage.setItem(this.tokenKey, token);
    }
  }

  private toAuthError(error: unknown): Error {
    if (error instanceof HttpErrorResponse) {
      const apiError = error.error as ApiError | null;
      if (apiError?.error) {
        return new Error(apiError.error);
      }
      if (error.status === 0) {
        return new Error('Le serveur est indisponible. Lance le backend puis réessaie.');
      }
    }

    return new Error('Impossible de terminer la demande.');
  }
}
