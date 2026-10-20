const nacl = require('tweetnacl');

module.exports = async (req, res) => {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }

  if (req.method === 'GET' || !body) {
    return res.status(200).send('ok');
  }

  // 加上 trim()，自动删掉你复制时可能不小心带上的空格
  const secret = (process.env.QQ_SECRET || '').trim();

  // QQ 官方验证回调地址的请求
  if (body.op === 13) {
    try {
      const { plain_token, event_ts } = body.d;
      const seed = Buffer.from(secret, 'hex');
      const keyPair = nacl.sign.keyPair.fromSeed(seed);
      const msg = Buffer.from(event_ts + plain_token);
      const sig = Buffer.from(nacl.sign.detached(msg, keyPair.secretKey)).toString('hex');
      
      return res.status(200).json({ plain_token, signature: sig });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // 正常接收群消息
  if (body.t === 'GROUP_AT_MESSAGE_CREATE') {
    const { id: msgId, content, group_openid } = body.d;

    try {
      // 1. 请求 DeepSeek
      const aiRes = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(process.env.DEEPSEEK_API_KEY || '').trim()}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: content.trim() }]
        })
      });
      const aiData = await aiRes.json();
      const replyText = aiData.choices?.[0]?.message?.content || 'AI 脑子短路了~';

      // 2. 获取 Token
      const tokenRes = await fetch('https://bots.qq.com/app/getAppAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: (process.env.QQ_APPID || '').trim(),
          clientSecret: secret
        })
      });
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // 3. 回复群消息
      await fetch(`https://api.sgroup.qq.com/v2/groups/${group_openid}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `QQBot ${accessToken}`
        },
        body: JSON.stringify({
          content: replyText,
          msg_type: 0,
          msg_id: msgId
        })
      });

      return res.status(200).send('Success');
    } catch (err) {
      return res.status(500).send('Error');
    }
  }

  return res.status(200).send('ok');
};
