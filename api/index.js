const nacl = require('tweetnacl');

function genSignature(secret, eventTs, plainToken) {
  const seed = Buffer.from(secret, 'hex');
  const keyPair = nacl.sign.keyPair.fromSeed(seed);
  const msg = Buffer.from(eventTs + plainToken);
  return Buffer.from(nacl.sign.detached(msg, keyPair.secretKey)).toString('hex');
}

module.exports = async (req, res) => {
  const secret = process.env.QQ_SECRET;

  // QQ 官方验证回调地址的请求
  if (req.method === 'POST' && req.body && req.body.op === 13) {
    const { plain_token, event_ts } = req.body.d;
    const sig = genSignature(secret, event_ts, plain_token);
    return res.status(200).json({ plain_token, signature: sig });
  }

  // 正常接收消息
  if (req.method === 'POST' && req.body && req.body.t === 'GROUP_AT_MESSAGE_CREATE') {
    const { id: msgId, content, group_openid } = req.body.d;

    // 1. 请求 DeepSeek
    const aiRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
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
        appId: process.env.QQ_APPID,
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
  }

  return res.status(200).send('ok');
};
