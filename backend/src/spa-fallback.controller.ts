import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class SpaFallbackController {
  private readonly indexPath = join(process.cwd(), 'public', 'index.html');

  @Get(['login', 'login/*', 'master', 'master/*', 'rental', 'rental/*'])
  serveSpa(@Res() res: Response) {
    res.sendFile(this.indexPath);
  }
}
